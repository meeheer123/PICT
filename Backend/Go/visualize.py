import folium
from folium import plugins
import json
import requests

def create_route_visualization(routes_data):
    """
    Create an interactive map visualization of multiple routes with different risk weights.
    
    Args:
        routes_data: Dictionary containing routes, center point, start and end points
    """
    # Create base map centered on the provided center coordinates
    center = routes_data['center']
    m = folium.Map(
        location=[center['Y'], center['X']],
        zoom_start=13,
        tiles='cartodbpositron'
    )
    
    # Define color scheme and descriptions for different alpha values
    colors = {
        0.00: 'blue',
        0.25: 'green',
        0.50: 'yellow',
        0.75: 'orange'
    }
    
    descriptions = {
        0.00: 'Distance Only Route',
        0.25: 'Low Risk Route',
        0.50: 'Balanced Route',
        0.75: 'High Safety Route'
    }
    
    # Create feature groups for each route
    for route in routes_data['routes']:
        alpha = route['alpha']
        color = colors.get(alpha, 'gray')
        description = descriptions.get(alpha, f'Route (α={alpha})')
        
        # Create a feature group for this route
        route_group = folium.FeatureGroup(
            name=f"{description} (α={alpha:.2f})",
            show=(alpha == 0.50)  # Show balanced route by default
        )
        
        # Convert path to coordinates for folium
        coords = [[point['Y'], point['X']] for point in route['path']]
        
        # Add route line to the map
        folium.PolyLine(
            coords,
            color=color,
            weight=4,
            opacity=0.8,
            popup=f'Risk Weight (α): {alpha:.2f}<br>'
                  f'Distance: {route["distance"]:.2f}<br>'
                  f'Risk Score: {route["risk"]:.4f}'
        ).add_to(route_group)
        
        route_group.add_to(m)
    
    # Add markers for start and end points
    start = routes_data['start']
    end = routes_data['end']
    
    # Start marker
    folium.Marker(
        location=[start['Y'], start['X']],
        popup='Start Point',
        icon=folium.Icon(color='green', icon='info-sign'),
        tooltip='Start Location'
    ).add_to(m)
    
    # End marker
    folium.Marker(
        location=[end['Y'], end['X']],
        popup='End Point',
        icon=folium.Icon(color='red', icon='info-sign'),
        tooltip='Destination'
    ).add_to(m)
    
    # Add custom legend
    legend_html = """
    <div style="position: fixed; 
                bottom: 50px; 
                left: 50px; 
                z-index: 1000;
                background-color: white;
                padding: 10px;
                border: 2px solid grey;
                border-radius: 5px;
                font-family: Arial, sans-serif;">
        <p><b>Routes by Risk Weight (α):</b></p>
        <p><span style='color: blue;'>&#9644;</span> Distance Only (α=0.00)</p>
        <p><span style='color: green;'>&#9644;</span> Low Risk (α=0.25)</p>
        <p><span style='color: yellow;'>&#9644;</span> Balanced (α=0.50)</p>
        <p><span style='color: orange;'>&#9644;</span> High Safety (α=0.75)</p>
        <p>
        <span style='color: green;'>●</span> Start Point<br>
        <span style='color: red;'>●</span> End Point
        </p>
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend_html))
    
    # Add layer control
    folium.LayerControl(
        collapsed=False,
        position='topright'
    ).add_to(m)
    
    return m

def get_example_routes():
    """
    Get example route data from the local API server.
    """
    # Example coordinates (similar to the ones in the original code)
    data = {
        "start_x": -87.7154,  # Garfield Park
        "start_y": 41.8881,
        "end_x": -87.6298,    # Downtown Loop
        "end_y": 41.8781
    }
    
    try:
        response = requests.post('http://localhost:8080/route', json=data)
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching routes: {e}")
        return None

def main():
    """
    Main function to create and save the visualization.
    """
    try:
        # Get route data from the API
        routes_data = get_example_routes()
        
        if routes_data:
            # Create the visualization
            map_viz = create_route_visualization(routes_data)
            
            # Save the map
            output_file = 'chicago_routes_visualization.html'
            map_viz.save(output_file)
            print(f"Map visualization has been saved to {output_file}")
        else:
            print("Failed to get route data. Make sure the API server is running.")
            
    except Exception as e:
        print(f"Error creating visualization: {str(e)}")

if __name__ == "__main__":
    main()