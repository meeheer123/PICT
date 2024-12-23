import pandas as pd
import numpy as np
from geopy.distance import geodesic
import googlemaps
import polyline
from datetime import datetime, timedelta
import folium
from folium.plugins import HeatMap

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

        cutoff_date = datetime.now() - timedelta(days=time_window_days)
        self.crime_data = self.crime_data[self.crime_data['date_single'] >= cutoff_date]

        self.crime_data = self.crime_data[['offense_type', 'date_single', 'longitude', 'latitude']]

        self.crime_data['severity'] = self.crime_data['offense_type'].str.lower().map(self.severity_map)
        self.crime_data['severity'] = self.crime_data['severity'].fillna(1)

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
        recent_weight = 2.0

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
                    distance_weight = 1 - (distance / self.SEARCH_RADIUS)
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
        return scored_routes

def visualize_routes_with_heatmap(scored_routes, start_location, end_location, crime_data):
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

    feature_group_safe = folium.FeatureGroup(name="Safest Route", show=True)
    feature_group_moderate = folium.FeatureGroup(name="Moderate Route", show=False)
    feature_group_fastest = folium.FeatureGroup(name="Fastest Route", show=False)
    feature_group_heatmap = folium.FeatureGroup(name="Crime Heatmap", show=True)

    add_route_to_map(
        safest_route,
        feature_group_safe,
        "green",
        f"Safest Route<br>Safety Score: {safest_route['safety_score']:.2f}<br>"
        f"Severity Score: {safest_route['severity_score']:.2f}<br>Total Crimes: {safest_route['crime_count']}<br>"
        f"Distance: {safest_route['distance']/1000:.2f}km<br>Duration: {safest_route['duration']}"
    )

    add_route_to_map(
        moderate_route,
        feature_group_moderate,
        "yellow",
        f"Moderate Route<br>Safety Score: {moderate_route['safety_score']:.2f}<br>"
        f"Severity Score: {moderate_route['severity_score']:.2f}<br>Total Crimes: {moderate_route['crime_count']}<br>"
        f"Distance: {moderate_route['distance']/1000:.2f}km<br>Duration: {moderate_route['duration']}"
    )

    fastest_route_color = "red" if fastest_route['safety_score'] > 5 else "green" if fastest_route['safety_score'] <= 3 else "orange"
    add_route_to_map(
        fastest_route,
        feature_group_fastest,
        fastest_route_color,
        f"Fastest Route<br>Safety Score: {fastest_route['safety_score']:.2f}<br>"
        f"Severity Score: {fastest_route['severity_score']:.2f}<br>Total Crimes: {fastest_route['crime_count']}<br>"
        f"Distance: {fastest_route['distance']/1000:.2f}km<br>Duration: {fastest_route['duration']}"
    )

    heatmap_data = [[row['latitude'], row['longitude']] for _, row in crime_data.iterrows()]
    HeatMap(heatmap_data, radius=15).add_to(feature_group_heatmap)

    m.add_child(feature_group_safe)
    m.add_child(feature_group_moderate)
    m.add_child(feature_group_fastest)
    m.add_child(feature_group_heatmap)
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

    m.save('routes_with_heatmap.html')

if __name__ == "__main__":
    recommender = SafeRouteRecommender('AIzaSyAnAszR8yWJ-xrdN61WpGU4ki08WXygS64')
    recommender.load_crime_data('datasets/crime_open_database_core_2022.csv')

    start = (41.8781, -87.6298)
    end = (41.9484, -87.6553)

    routes = recommender.recommend_routes(start, end)
    visualize_routes_with_heatmap(routes, start, end, recommender.crime_data)