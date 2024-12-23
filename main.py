import pandas as pd
import numpy as np
from geopy.distance import geodesic
import googlemaps
import polyline
import hashlib
from datetime import datetime, timedelta
import folium
from folium import plugins

class SafeRouteRecommender:
    def __init__(self, api_key):
        self.gmaps = googlemaps.Client(key=api_key)
        self.crime_data = None
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
        
    def load_crime_data(self, csv_path, time_window_days=365):
        self.crime_data = pd.read_csv(csv_path, low_memory=False)
        
        self.crime_data['date_single'] = pd.to_datetime(
            self.crime_data['date_single'],
            format='mixed',
            errors='coerce'
        )
        
        # Filter for recent crimes only
        cutoff_date = datetime.now() - timedelta(days=time_window_days)
        self.crime_data = self.crime_data[self.crime_data['date_single'] >= cutoff_date]
        
        self.crime_data = self.crime_data[['offense_type', 'date_single', 'longitude', 'latitude']]
        
        # Add severity weights with case-insensitive matching
        self.crime_data['severity'] = self.crime_data['offense_type'].str.lower().map(self.severity_map)
        self.crime_data['severity'] = self.crime_data['severity'].fillna(1)  # Default severity
        
        self.crime_data = self.crime_data.dropna(subset=['longitude', 'latitude'])
    
    def get_routes(self, start_location, end_location, mode="driving"):
        try:
            routes = self.gmaps.directions(
                start_location,
                end_location,
                mode=mode,
                alternatives=True,
                departure_time=datetime.now()
            )
            return routes if routes else []
        except Exception as e:
            print(f"Error getting routes: {e}")
            return []
    
    def decode_polyline(self, polyline_str):
        try:
            return polyline.decode(polyline_str)
        except Exception as e:
            print(f"Error decoding polyline: {e}")
            return []
    
    def calculate_crime_score(self, route_points):
        total_severity = 0
        crime_counts = {}
        recent_weight = 2.0  # Higher weight for recent crimes
        
        for point in route_points:
            lat, lon = point
            crimes_nearby = self.crime_data[
                (self.crime_data['latitude'].between(lat - 0.002, lat + 0.002)) &
                (self.crime_data['longitude'].between(lon - 0.002, lon + 0.002))
            ]
            
            for _, crime in crimes_nearby.iterrows():
                distance = geodesic(
                    (lat, lon),
                    (crime['latitude'], crime['longitude'])
                ).meters
                
                if distance <= self.SEARCH_RADIUS:
                    # Apply distance-based weight (closer crimes have higher impact)
                    distance_weight = 1 - (distance / self.SEARCH_RADIUS)
                    
                    # Apply recency weight
                    days_old = (datetime.now() - crime['date_single']).days
                    time_weight = recent_weight if days_old <= 30 else 1.0
                    
                    severity = crime['severity'] * distance_weight * time_weight
                    total_severity += severity
                    
                    offense = crime['offense_type']
                    crime_counts[offense] = crime_counts.get(offense, 0) + 1
        
        return total_severity, crime_counts
    
    def calculate_safety_score(self, route):
        points = self.decode_polyline(route['overview_polyline']['points'])
        if not points:
            return float('inf'), 0, 0, 0, {}
        
        severity_score, crime_counts = self.calculate_crime_score(points)
        
        distance = route['legs'][0]['distance']['value']
        duration = route['legs'][0]['duration']['value']
        
        normalized_severity = severity_score / len(points)
        
        total_crimes = sum(crime_counts.values())
        
        # Balanced scoring with higher weight to severity
        safety_score = (
            (0.5 * normalized_severity) +
            (0.3 * (total_crimes / len(points))) +
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
        
        if len(scored_routes) > 1:
            max_score = max(r['safety_score'] for r in scored_routes)
            min_score = min(r['safety_score'] for r in scored_routes)
            score_range = max_score - min_score if max_score != min_score else 1
            
            for route in scored_routes:
                normalized_score = (route['safety_score'] - min_score) / score_range
                if normalized_score <= 0.33:
                    route['safety_category'] = 'safe'
                    route['color'] = 'green'
                elif normalized_score <= 0.66:
                    route['safety_category'] = 'moderate'
                    route['color'] = 'orange'
                else:
                    route['safety_category'] = 'unsafe'
                    route['color'] = 'red'
        else:
            # If only one route, classify based on absolute score
            route = scored_routes[0]
            if route['safety_score'] <= 5:
                route['safety_category'] = 'safe'
                route['color'] = 'green'
            elif route['safety_score'] <= 10:
                route['safety_category'] = 'moderate'
                route['color'] = 'orange'
            else:
                route['safety_category'] = 'unsafe'
                route['color'] = 'red'
        
        return scored_routes

def visualize_routes(scored_routes, start_location, end_location):
    if not scored_routes:
        print("No routes to visualize")
        return
    
    center_lat = (start_location[0] + end_location[0]) / 2
    center_lon = (start_location[1] + end_location[1]) / 2
    m = folium.Map(location=[center_lat, center_lon], zoom_start=12)
    
    legend_html = """
    <div style="position: fixed; bottom: 50px; left: 50px; z-index: 1000; background-color: white; padding: 10px; border: 2px solid grey; border-radius: 5px">
        <p><strong>Route Safety:</strong></p>
        <p><span style="color: green;">⬤</span> Safe</p>
        <p><span style="color: orange;">⬤</span> Moderate</p>
        <p><span style="color: red;">⬤</span> Unsafe</p>
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend_html))
    
    feature_group = folium.FeatureGroup(name="Routes")

    for i, route in enumerate(scored_routes):
        path_points = polyline.decode(route['polyline'])

        popup_text = (
            f"Safety Category: {route['safety_category']}<br>"
            f"Safety Score: {route['safety_score']:.2f}<br>"
            f"Severity Score: {route['severity_score']:.2f}<br>"
            f"Total Crimes: {route['crime_count']}<br>"
            f"Distance: {route['distance']/1000:.2f}km<br>"
            f"Duration: {route['duration']}"
        )

        line = folium.PolyLine(
            locations=path_points,
            color=route['color'],
            weight=4,
            opacity=0.8,
            popup=folium.Popup(popup_text, max_width=300)
        )
        feature_group.add_child(line)

    m.add_child(feature_group)
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

    m.save('safe_routes_map.html')

if __name__ == "__main__":
    recommender = SafeRouteRecommender('AIzaSyAnAszR8yWJ-xrdN61WpGU4ki08WXygS64')
    recommender.load_crime_data('datasets/crime_open_database_core_2022.csv')

    start = (41.8781, -87.6298)
    end = (41.9484, -87.6553)

    routes = recommender.recommend_routes(start, end)
    visualize_routes(routes, start, end)
