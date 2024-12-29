import pandas as pd
import geopandas as gpd
import networkx as nx
import folium
from folium.plugins import HeatMap
import numpy as np
from shapely.geometry import Point, LineString, Polygon, box
from shapely.ops import unary_union
from datetime import datetime
import json
from functools import lru_cache
import heapq
import warnings
warnings.filterwarnings('ignore')

# Define Chicago boundaries - slightly expanded for better coverage
CHICAGO_BOUNDS = box(-87.94011, 41.64454, -87.52414, 42.02304)

class RiskAwareRouter:
    def __init__(self, geojson_path, crime_data):
        """
        Initialize the router with Chicago-specific road network and crime data.
        """
        self.G = self.load_risk_network(geojson_path)
        self.crime_data = self.prepare_crime_data(crime_data)
        self._cached_heatmap_data = None
        
    def prepare_crime_data(self, crime_data):
        """
        Prepare crime data with Chicago-specific filtering and optimization.
        """
        # Less restrictive filtering for crime data
        mask = (
            (crime_data['longitude'].between(-87.94011, -87.52414, inclusive='both')) &
            (crime_data['latitude'].between(41.64454, 42.02304, inclusive='both'))
        )
        
        # Handle missing values more gracefully
        crime_data = crime_data[mask].copy()
        crime_data['latitude'].fillna(method='ffill', inplace=True)
        crime_data['longitude'].fillna(method='ffill', inplace=True)
        
        # Convert to numeric efficiently
        crime_data['latitude'] = pd.to_numeric(crime_data['latitude'], errors='coerce')
        crime_data['longitude'] = pd.to_numeric(crime_data['longitude'], errors='coerce')
        
        # Normalize severity levels
        if 'severity_level' not in crime_data.columns:
            # You might want to adjust this based on your crime categories
            crime_data['severity_level'] = 1.0
        else:
            # Normalize severity to be between 0.5 and 1.5
            min_sev = crime_data['severity_level'].min()
            max_sev = crime_data['severity_level'].max()
            crime_data['severity_level'] = 0.5 + (crime_data['severity_level'] - min_sev) * (1.0 / (max_sev - min_sev))
            
        # Create geometry column directly without list comprehension
        geometry = gpd.points_from_xy(crime_data.longitude, crime_data.latitude)
        return gpd.GeoDataFrame(crime_data, geometry=geometry)
    
    def load_risk_network(self, geojson_path):
        """
        Load Chicago road network with optimized preprocessing.
        """
        with open(geojson_path, 'r') as f:
            geojson_data = json.load(f)
        
        # Filter for Chicago area
        roads_gdf = gpd.GeoDataFrame.from_features(geojson_data['features'])
        roads_gdf = roads_gdf[roads_gdf.geometry.intersects(CHICAGO_BOUNDS)]
        
        G = nx.Graph()
        distances = []
        
        # Batch process edges
        edge_data = []
        for idx, row in roads_gdf.iterrows():
            if isinstance(row.geometry, LineString):
                coords = list(row.geometry.coords)
                for i in range(len(coords) - 1):
                    start, end = coords[i], coords[i + 1]
                    distance = Point(start).distance(Point(end))
                    distances.append(distance)
                    edge_data.append((
                        start, end, {
                            'distance': distance,
                            'risk_score': row.get('risk_score', 0.5),
                            'geometry': LineString([start, end])
                        }
                    ))
        
        # Batch add edges
        max_distance = max(distances)
        G.add_edges_from(edge_data)
        nx.set_edge_attributes(G, max_distance, 'max_distance')
        
        return G
    
    @lru_cache(maxsize=1024)
    def calculate_edge_weight(self, u, v, distance, max_distance, risk_score, alpha):
        """
        Cached edge weight calculation.
        """
        norm_distance = distance / max_distance
        return ((1 - alpha) * norm_distance + alpha * risk_score) * max_distance
    
    @lru_cache(maxsize=1024)
    def heuristic(self, node_x, node_y, goal_x, goal_y):
        """
        Cached heuristic calculation using coordinates directly.
        """
        return ((node_x - goal_x) ** 2 + (node_y - goal_y) ** 2) ** 0.5
    
    @lru_cache(maxsize=128)
    def find_nearest_node(self, point):
        """
        Cached nearest node finder.
        """
        nodes = list(self.G.nodes())
        distances = [((node[0] - point[0])**2 + (node[1] - point[1])**2)**0.5 for node in nodes]
        return nodes[np.argmin(distances)]
    
    def find_route(self, start_point, end_point, alpha):
        """
        Optimized A* pathfinding.
        """
        try:
            frontier = []
            cost_so_far = {start_point: 0}
            came_from = {start_point: None}
            
            # Pre-calculate end point coordinates
            end_x, end_y = end_point
            
            heapq.heappush(frontier, (
                self.heuristic(start_point[0], start_point[1], end_x, end_y),
                start_point
            ))
            
            while frontier:
                current_priority, current = heapq.heappop(frontier)
                
                if current == end_point:
                    return self._reconstruct_path(came_from, current)
                
                for next_node in self.G.neighbors(current):
                    edge_data = self.G.edges[current, next_node]
                    new_cost = cost_so_far[current] + self.calculate_edge_weight(
                        current[0], current[1],
                        edge_data['distance'],
                        edge_data['max_distance'],
                        edge_data['risk_score'],
                        alpha
                    )
                    
                    if next_node not in cost_so_far or new_cost < cost_so_far[next_node]:
                        cost_so_far[next_node] = new_cost
                        priority = new_cost + self.heuristic(
                            next_node[0], next_node[1],
                            end_x, end_y
                        )
                        heapq.heappush(frontier, (priority, next_node))
                        came_from[next_node] = current
            
            return None, None, None, None
            
        except Exception as e:
            print(f"Error finding route: {str(e)}")
            return None, None, None, None
    
    def _reconstruct_path(self, came_from, current):
        """
        Helper method to reconstruct path and calculate metrics.
        """
        path = []
        path_edges = []
        total_distance = 0
        total_risk = 0
        
        while current:
            path.append(current)
            current = came_from[current]
        
        path.reverse()
        
        for i in range(len(path) - 1):
            edge_data = self.G.edges[path[i], path[i + 1]]
            total_distance += edge_data['distance']
            total_risk += edge_data['risk_score'] * edge_data['distance']
            path_edges.append(edge_data['geometry'])
        
        avg_risk = total_risk / total_distance if total_distance > 0 else 0
        return path, path_edges, total_distance, avg_risk
    
    @property
    def heatmap_data(self):
        """
        Cached crime heatmap data with improved density visualization.
        """
        if self._cached_heatmap_data is None:
            crime_locations = []
            for _, row in self.crime_data.iterrows():
                try:
                    lat, lon = float(row.geometry.y), float(row.geometry.x)
                    # Increase weight for better visibility
                    weight = float(row['severity_level']) * 2.0  # Amplify the weight
                    if not (np.isnan(lat) or np.isnan(lon) or np.isnan(weight)):
                        crime_locations.append([lat, lon, weight])
                except (ValueError, AttributeError):
                    continue
            self._cached_heatmap_data = crime_locations
        return self._cached_heatmap_data
    
    def create_integrated_map(self, source_coords, dest_coords):
        """
        Create interactive map with separated route overlays and markers.
        """
        # Find nearest nodes (cached)
        source_point = self.find_nearest_node(source_coords)
        dest_point = self.find_nearest_node(dest_coords)
        
        # Calculate center point
        center_point = [
            (source_coords[1] + dest_coords[1])/2,
            (source_coords[0] + dest_coords[0])/2
        ]
        
        # Create base map
        m = folium.Map(location=center_point, zoom_start=13)
        
        # Add enhanced heatmap as a separate layer
        if self.heatmap_data:
            heat_layer = HeatMap(
                data=self.heatmap_data,
                radius=20,
                blur=25,
                max_zoom=17,
                min_opacity=0.4
            )
            heatmap_group = folium.FeatureGroup(name="Crime Heatmap", show=True)
            heat_layer.add_to(heatmap_group)
            heatmap_group.add_to(m)
        
        # Calculate routes with different risk weights
        alphas = [0.00, 0.25, 0.50, 0.75]
        colors = {0.00: 'blue', 0.25: 'green', 0.50: 'yellow', 0.75: 'orange'}
        descriptions = {
            0.00: 'Distance Only Route',
            0.25: 'Low Risk Route',
            0.50: 'Balanced Route',
            0.75: 'High Safety Route'
        }
        
        # Create separate feature groups for each route
        for alpha in alphas:
            path, path_edges, distance, risk = self.find_route(source_point, dest_point, alpha)
            if path is not None:
                route = LineString([Point(p) for p in path])
                coords = [[y, x] for x, y in route.coords]
                
                # Create feature group for this route
                route_group = folium.FeatureGroup(
                    name=f"{descriptions[alpha]} (α={alpha:.2f})",
                    show=(alpha == 0.50)  # Show balanced route by default
                )
                
                # Add route to its group
                folium.PolyLine(
                    coords,
                    color=colors[alpha],
                    weight=4,
                    opacity=0.8,
                    popup=f'Risk Weight (α): {alpha:.2f}<br>'
                          f'Distance: {distance:.2f} meters<br>'
                          f'Avg Risk Score: {risk:.4f}'
                ).add_to(route_group)
                
                route_group.add_to(m)
        
        # Add markers for start and end points
        start_marker = folium.Marker(
            location=[source_coords[1], source_coords[0]],
            popup='Start Point',
            icon=folium.Icon(color='green', icon='info-sign'),
            tooltip='Start Location'
        )
        end_marker = folium.Marker(
            location=[dest_coords[1], dest_coords[0]],
            popup='End Point',
            icon=folium.Icon(color='red', icon='info-sign'),
            tooltip='Destination'
        )
        
        # Create a feature group for markers
        markers_group = folium.FeatureGroup(name="Start/End Points", show=True)
        start_marker.add_to(markers_group)
        end_marker.add_to(markers_group)
        markers_group.add_to(m)
        
        # Add legend
        legend_html = """
        <div style="position: fixed; bottom: 50px; left: 50px; z-index: 1000; 
             background-color: white; padding: 10px; border: 2px solid grey;">
            <p><b>Routes by Risk Weight (α):</b></p>
            <p><span style='color: blue;'>&#9644;</span> Distance Only (α=0.00)</p>
            <p><span style='color: green;'>&#9644;</span> Low Risk (α=0.25)</p>
            <p><span style='color: yellow;'>&#9644;</span> Balanced (α=0.50)</p>
            <p><span style='color: orange;'>&#9644;</span> High Risk (α=0.75)</p>
            <p>
            <span style='color: green;'>●</span> Start Point<br>
            <span style='color: red;'>●</span> End Point
            </p>
        </div>
        """
        m.get_root().html.add_child(folium.Element(legend_html))
        
        # Add layer control with expanded selection
        folium.LayerControl(
            collapsed=False,
            position='topright'
        ).add_to(m)
        
        return m

def main():
    """Main function with Chicago-specific configuration."""
    try:
        geojson_path = '../datasets/chicago_roads_with_risk.geojson'
        crime_data = pd.read_csv("../datasets/crime_open_database_core_2022.csv")
        
        router = RiskAwareRouter(geojson_path, crime_data)
        
        # Example coordinates (O'Hare to Downtown Chicago)
        source_coords = (-87.7154, 41.8881)  # Garfield Park
        dest_coords = (-87.6298, 41.8781)    # Downtown Loop
        
        comparison_map = router.create_integrated_map(source_coords, dest_coords)
        comparison_map.save('integrated_route_comparison.html')
        
        print("Analysis complete! Integrated route comparison map has been saved.")
        
    except Exception as e:
        print(f"Error in main function: {str(e)}")

if __name__ == "__main__":
    main()
