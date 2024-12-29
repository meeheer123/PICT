import pandas as pd
import numpy as np
from geopy.distance import geodesic
import googlemaps
import polyline
from datetime import datetime, timedelta
import folium
from folium.plugins import HeatMap
from scipy.spatial import cKDTree
import gc
from functools import lru_cache
import webbrowser

class SafeRouteRecommender:
    def __init__(self, api_key):
        self.gmaps = googlemaps.Client(key=api_key)
        self.crime_data = None
        self.crime_tree = None
        self.SEARCH_RADIUS = 200
        self.severity_map = {
            'murder and nonnegligent manslaughter': 12,
            'kidnapping/abduction': 11,
            'rape (except statutory rape)': 11,
            'aggravated assault': 10,
            'sexual assault with an object': 10,
            'robbery': 9,
            'human trafficking, commercial sex acts': 9,
            'sexual assault by penetration (including rape)': 8,
            'personal robbery': 8,
            'commercial robbery': 8,
            'motor vehicle theft': 6,
            'burglary/breaking & entering': 6,
            'residential burglary/breaking & entering': 6,
            'theft of motor vehicle parts or accessories': 5,
            'theft from motor vehicle (except theft of motor vehicle parts or accessories)': 4,
            'shoplifting': 4,
            'other larceny': 4,
            'weapon law violations': 4,
            'impersonation': 3,
            'fraud offenses': 3,
            'credit card/automated teller machine fraud': 3,
            'destruction/damage/vandalism of property': 3,
            'disorderly conduct': 2,
            'trespass of real property': 2,
            'all other offenses': 1,
            'liquor law violations': 1,
            'drug/narcotic violations': 1,
            'driving under the influence': 1
        }
        self._routes_cache = {}

    def load_crime_data(self, csv_path, time_window_days=3650):
        date_parser = lambda x: pd.to_datetime(x, format='mixed', errors='coerce')
        self.crime_data = pd.read_csv(
            csv_path, 
            usecols=['offense_type', 'date_single', 'longitude', 'latitude'],
            parse_dates=['date_single'],
            date_parser=date_parser,
            low_memory=False
        )
        
        self.total_crime_data = self.crime_data[['latitude', 'longitude']].copy()
        
        cutoff_date = datetime.now() - timedelta(days=time_window_days)
        self.crime_data = self.crime_data[self.crime_data['date_single'] >= cutoff_date]
        
        self.crime_data['severity'] = self.crime_data['offense_type'].str.lower().map(self.severity_map).fillna(1)
        self.crime_data = self.crime_data.dropna(subset=['longitude', 'latitude', 'date_single'])
        
        self.crime_coords = self.crime_data[['latitude', 'longitude']].values
        self.crime_tree = cKDTree(self.crime_coords, leafsize=16)
        
        del self.crime_data['offense_type']
        gc.collect()

    @lru_cache(maxsize=100)
    def get_routes(self, start_location, end_location, mode="driving"):
        cache_key = (start_location, end_location, mode)
        if cache_key in self._routes_cache:
            return self._routes_cache[cache_key]
            
        try:
            routes = self.gmaps.directions(
                start_location,
                end_location,
                mode=mode,
                alternatives=True,
                departure_time=datetime.now()
            )
            self._routes_cache[cache_key] = routes if routes else []
            return self._routes_cache[cache_key]
        except Exception as e:
            print(f"Error getting routes: {e}")
            return []

    def calculate_crime_score(self, route_points):
        if not route_points or len(route_points) == 0:
            return 0, {}
            
        recent_weight = 2.0
        search_radius_degrees = self.SEARCH_RADIUS / 111000

        route_points_array = np.array(route_points)
        
        distances, indices = self.crime_tree.query(
            route_points_array, 
            k=50, 
            distance_upper_bound=search_radius_degrees,
            workers=-1
        )
        
        valid_mask = indices < len(self.crime_coords)
        valid_indices = indices[valid_mask]
        valid_distances = distances[valid_mask] * 111000
        
        if len(valid_indices) == 0:
            return 0, {}
        
        nearby_crimes = self.crime_data.iloc[valid_indices]
        
        distance_weights = 1 - (valid_distances / self.SEARCH_RADIUS)
        days_old = (datetime.now() - nearby_crimes['date_single']).dt.days.values
        time_weights = np.where(days_old <= 30, recent_weight, 1.0)
        
        severities = nearby_crimes['severity'].values * distance_weights * time_weights
        total_severity = np.sum(severities)
        
        crime_counts = nearby_crimes['severity'].value_counts().to_dict()
        
        return total_severity, crime_counts

    def calculate_safety_score(self, route):
        points = polyline.decode(route['overview_polyline']['points'])
        if not points:
            return float('inf'), 0, 0, 0, {}

        severity_score, crime_counts = self.calculate_crime_score(points)

        distance = route['legs'][0]['distance']['value']
        duration = route['legs'][0]['duration']['value']
        
        num_points = len(points)
        normalized_severity = severity_score / num_points if num_points > 0 else float('inf')
        total_crimes = sum(crime_counts.values())

        safety_score = (
            (0.5 * normalized_severity) +
            (0.3 * (total_crimes / num_points if num_points > 0 else float('inf'))) +
            (0.2 * (distance / 1000))
        )

        return safety_score, severity_score, total_crimes, distance, crime_counts

    def recommend_routes(self, start_location, end_location, mode="driving"):
        routes = self.get_routes(start_location, end_location, mode)
        if not routes:
            return []

        scored_routes = []
        for route in routes:
            safety_score, severity_score, crime_count, distance, crime_counts = self.calculate_safety_score(route)
            scored_routes.append({
                'route': route,
                'safety_score': safety_score,
                'severity_score': severity_score,
                'crime_count': crime_count,
                'crime_breakdown': crime_counts,
                'distance': distance,
                'duration': route['legs'][0]['duration']['text'],
                'polyline': route['overview_polyline']['points']
            })

        scored_routes.sort(key=lambda x: x['safety_score'])
        return scored_routes

    def get_google_maps_navigation_url(self, route):
        """Generate Google Maps navigation URL for the given route"""
        waypoints = polyline.decode(route['route']['overview_polyline']['points'])
        start = f"{waypoints[0][0]},{waypoints[0][1]}"
        end = f"{waypoints[-1][0]},{waypoints[-1][1]}"
        
        # Format waypoints for Google Maps URL
        waypoints_str = "|".join(f"{lat},{lon}" for lat, lon in waypoints[1:-1])
        
        # Construct navigation URL
        url = f"https://www.google.com/maps/dir/?api=1&origin={start}&destination={end}"
        if waypoints_str:
            url += f"&waypoints={waypoints_str}"
        
        return url

    def navigate_safe_route(self, start_location, end_location, mode="driving"):
        """Get navigation URL for safest route and open in browser"""
        routes = self.recommend_routes(start_location, end_location, mode)
        if routes:
            url = self.get_google_maps_navigation_url(routes[0])
            webbrowser.open(url)
            return url
        return None

def visualize_routes_with_heatmap(scored_routes, start_location, end_location, crime_data, output_filename='routes_with_heatmap.html'):
    if not scored_routes:
        print("No routes to visualize")
        return

    fastest_route = min(scored_routes, key=lambda r: r['route']['legs'][0]['duration']['value'])
    safest_route = min(scored_routes, key=lambda r: r['safety_score'])
    scored_routes_sorted = sorted(scored_routes, key=lambda r: r['safety_score'])
    moderate_route = scored_routes_sorted[len(scored_routes_sorted) // 2]

    center_lat = (start_location[0] + end_location[0]) / 2
    center_lon = (start_location[1] + end_location[1]) / 2
    m = folium.Map(location=[center_lat, center_lon], zoom_start=12)

    legend_html = """
    <div style="position: fixed; bottom: 50px; left: 50px; z-index: 1000; background-color: white; padding: 10px; border: 2px solid grey; border-radius: 5px">
        <p><strong>Route Safety Legend:</strong></p>
        <p><span style="color: green;">&#9679;</span> Safest Route</p>
        <p><span style="color: yellow;">&#9679;</span> Moderate Route</p>
        <p><span style="color: red;">&#9679;</span> Fastest Route</p>
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend_html))

    def add_route_to_map(route, group, color, popup_info):
        path_points = polyline.decode(route['polyline'])
        line = folium.PolyLine(
            locations=path_points,
            color=color,
            weight=5,
            opacity=0.8,
            popup=folium.Popup(popup_info, max_width=300)
        )
        group.add_child(line)

    feature_groups = {
        'safe': folium.FeatureGroup(name="Safest Route", show=True),
        'moderate': folium.FeatureGroup(name="Moderate Route", show=False),
        'fastest': folium.FeatureGroup(name="Fastest Route", show=False),
        'heatmap': folium.FeatureGroup(name="Crime Heatmap", show=False)
    }

    add_route_to_map(
        safest_route,
        feature_groups['safe'],
        "green",
        f"Safest Route<br>Safety Score: {safest_route['safety_score']:.2f}<br>"
        f"Severity Score: {safest_route['severity_score']:.2f}<br>Total Crimes: {safest_route['crime_count']}<br>"
        f"Distance: {safest_route['distance']/1000:.2f}km<br>Duration: {safest_route['duration']}"
    )

    add_route_to_map(
        moderate_route,
        feature_groups['moderate'],
        "yellow",
        f"Moderate Route<br>Safety Score: {moderate_route['safety_score']:.2f}<br>"
        f"Severity Score: {moderate_route['severity_score']:.2f}<br>Total Crimes: {moderate_route['crime_count']}<br>"
        f"Distance: {moderate_route['distance']/1000:.2f}km<br>Duration: {moderate_route['duration']}"
    )

    fastest_route_color = "red" if fastest_route['safety_score'] > 5 else "green" if fastest_route['safety_score'] <= 3 else "orange"
    add_route_to_map(
        fastest_route,
        feature_groups['fastest'],
        fastest_route_color,
        f"Fastest Route<br>Safety Score: {fastest_route['safety_score']:.2f}<br>"
        f"Severity Score: {fastest_route['severity_score']:.2f}<br>Total Crimes: {fastest_route['crime_count']}<br>"
        f"Distance: {fastest_route['distance']/1000:.2f}km<br>Duration: {fastest_route['duration']}"
    )

    heatmap_data = crime_data[['latitude', 'longitude']].values.tolist()
    HeatMap(heatmap_data, radius=15).add_to(feature_groups['heatmap'])

    for group in feature_groups.values():
        m.add_child(group)
    m.add_child(folium.LayerControl())

    folium.Marker(
        start_location,
        popup='Start',
        icon=folium.Icon(color='green', icon='info-sign')
    ).add_to(m)

    folium.Marker(
        end_location,
        popup='End',
        icon=folium.Icon(color='red', icon='info-sign')
    ).add_to(m)

    m.save(output_filename)

# Usage example:
if __name__ == "__main__":
    recommender = SafeRouteRecommender('AIzaSyAnAszR8yWJ-xrdN61WpGU4ki08WXygS64')
    recommender.load_crime_data('../datasets/crime_open_database_core_2022.csv')
    
    start = (41.8781, -87.6298)  # Example coordinates
    end = (41.9484, -87.6553)
    
    # To visualize routes
    routes = recommender.recommend_routes(start, end)
    visualize_routes_with_heatmap(routes, start, end, recommender.total_crime_data)
    
    # To navigate using Google Maps
    recommender.navigate_safe_route(start, end)