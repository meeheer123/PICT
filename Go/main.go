package main

import (
    "container/heap"
    "encoding/json"
    "fmt"
    "html/template"
    "math"
    "os"
    "sync"
)

// Constants for Chicago boundaries
var chicagoBounds = Bounds{
    MinX: -87.94011,
    MinY: 41.64454,
    MaxX: -87.52414,
    MaxY: 42.02304,
}

// Basic structs for geographic data
type Bounds struct {
    MinX, MinY, MaxX, MaxY float64
}

type Point struct {
    X, Y float64
}

// Edge represents a road segment
type Edge struct {
    Start, End Point
    Distance   float64
    RiskScore  float64
}

// Graph represents the road network
type Graph struct {
    Edges   map[Point]map[Point]Edge
    mu      sync.RWMutex
    maxDist float64
}

// RiskAwareRouter handles route calculations
type RiskAwareRouter struct {
    G           *Graph
    CrimeData   *CrimeData
    weightCache sync.Map
    nodeCache   sync.Map
}

// CrimeData stores crime information
type CrimeData struct {
    Points   []Point
    Severity []float64
    mu       sync.RWMutex
}

// Priority queue implementation for A* algorithm
type Item struct {
    point    Point
    priority float64
    index    int
}

type PriorityQueue []*Item

func (pq PriorityQueue) Len() int { return len(pq) }

func (pq PriorityQueue) Less(i, j int) bool {
    return pq[i].priority < pq[j].priority
}

func (pq PriorityQueue) Swap(i, j int) {
    pq[i], pq[j] = pq[j], pq[i]
    pq[i].index = i
    pq[j].index = j
}

func (pq *PriorityQueue) Push(x interface{}) {
    n := len(*pq)
    item := x.(*Item)
    item.index = n
    *pq = append(*pq, item)
}

func (pq *PriorityQueue) Pop() interface{} {
    old := *pq
    n := len(old)
    item := old[n-1]
    old[n-1] = nil
    item.index = -1
    *pq = old[0 : n-1]
    return item
}

// MapData represents the data needed for the map template
type MapData struct {
    Center     Point
    Zoom       int
    GeoJSONStr template.JS
}

// NewGraph creates a new road network graph
func NewGraph() *Graph {
    return &Graph{
        Edges: make(map[Point]map[Point]Edge),
    }
}

// AddEdge adds a bidirectional edge to the graph
func (g *Graph) AddEdge(start, end Point, distance, riskScore float64) {
    g.mu.Lock()
    defer g.mu.Unlock()

    // Add forward edge
    if g.Edges[start] == nil {
        g.Edges[start] = make(map[Point]Edge)
    }
    edge := Edge{
        Start:     start,
        End:       end,
        Distance:  distance,
        RiskScore: riskScore,
    }
    g.Edges[start][end] = edge

    // Add reverse edge
    if g.Edges[end] == nil {
        g.Edges[end] = make(map[Point]Edge)
    }
    reverseEdge := Edge{
        Start:     end,
        End:       start,
        Distance:  distance,
        RiskScore: riskScore,
    }
    g.Edges[end][start] = reverseEdge

    if distance > g.maxDist {
        g.maxDist = distance
    }
}

// validatePoints checks if points are within Chicago boundaries
func (r *RiskAwareRouter) validatePoints(start, end Point) error {
    if !isInBounds(start, chicagoBounds) {
        return fmt.Errorf("start point (%f, %f) is outside Chicago boundaries", start.X, start.Y)
    }
    if !isInBounds(end, chicagoBounds) {
        return fmt.Errorf("end point (%f, %f) is outside Chicago boundaries", end.X, end.Y)
    }
    return nil
}

// findNearestPoint finds the closest node in the graph to a given point
func (r *RiskAwareRouter) findNearestPoint(p Point) Point {
    r.G.mu.RLock()
    defer r.G.mu.RUnlock()

    minDist := math.MaxFloat64
    var nearest Point

    for node := range r.G.Edges {
        dist := math.Sqrt(math.Pow(node.X-p.X, 2) + math.Pow(node.Y-p.Y, 2))
        if dist < minDist {
            minDist = dist
            nearest = node
        }
    }

    fmt.Printf("Found nearest point to (%f, %f): (%f, %f) with distance %f\n",
        p.X, p.Y, nearest.X, nearest.Y, minDist)
    return nearest
}

// NewRiskAwareRouter creates a new router instance
func NewRiskAwareRouter(geojsonPath string, crimeData *CrimeData) (*RiskAwareRouter, error) {
    graph := NewGraph()
    err := loadRoadNetwork(geojsonPath, graph)
    if err != nil {
        return nil, fmt.Errorf("failed to load road network: %v", err)
    }

    fmt.Printf("Loaded road network with %d nodes\n", len(graph.Edges))
    return &RiskAwareRouter{
        G:         graph,
        CrimeData: crimeData,
    }, nil
}

// loadRoadNetwork loads the road network from GeoJSON
func loadRoadNetwork(path string, graph *Graph) error {
    file, err := os.ReadFile(path)
    if err != nil {
        return fmt.Errorf("failed to read file: %v", err)
    }

    var geojsonData map[string]interface{}
    if err := json.Unmarshal(file, &geojsonData); err != nil {
        return fmt.Errorf("failed to parse GeoJSON: %v", err)
    }

    features, ok := geojsonData["features"].([]interface{})
    if !ok {
        return fmt.Errorf("invalid GeoJSON structure: features not found")
    }

    fmt.Printf("Processing %d features from GeoJSON\n", len(features))

    var wg sync.WaitGroup
    featureChan := make(chan interface{}, len(features))

    numWorkers := 8
    for i := 0; i < numWorkers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for feature := range featureChan {
                processFeature(feature, graph)
            }
        }()
    }

    for _, feature := range features {
        featureChan <- feature
    }
    close(featureChan)

    wg.Wait()
    return nil
}

// processFeature processes a single GeoJSON feature
func processFeature(feature interface{}, graph *Graph) {
    f, ok := feature.(map[string]interface{})
    if !ok {
        return
    }

    geometry, ok := f["geometry"].(map[string]interface{})
    if !ok {
        return
    }

    if geometry["type"].(string) != "LineString" {
        return
    }

    coordinates, ok := geometry["coordinates"].([]interface{})
    if !ok || len(coordinates) < 2 {
        return
    }

    var riskScore float64 = 0.5
    if properties, ok := f["properties"].(map[string]interface{}); ok {
        if risk, exists := properties["risk_score"]; exists {
            riskScore, _ = risk.(float64)
        }
    }

    for i := 0; i < len(coordinates)-1; i++ {
        coord1, ok1 := coordinates[i].([]interface{})
        coord2, ok2 := coordinates[i+1].([]interface{})

        if !ok1 || !ok2 || len(coord1) < 2 || len(coord2) < 2 {
            continue
        }

        start := Point{
            X: coord1[0].(float64),
            Y: coord1[1].(float64),
        }
        end := Point{
            X: coord2[0].(float64),
            Y: coord2[1].(float64),
        }

        if isInBounds(start, chicagoBounds) && isInBounds(end, chicagoBounds) {
            distance := math.Sqrt(math.Pow(end.X-start.X, 2) + math.Pow(end.Y-start.Y, 2))
            graph.AddEdge(start, end, distance, riskScore)
        }
    }
}

// isInBounds checks if a point is within Chicago boundaries
func isInBounds(p Point, bounds Bounds) bool {
    return p.X >= bounds.MinX && p.X <= bounds.MaxX &&
        p.Y >= bounds.MinY && p.Y <= bounds.MaxY
}

// FindRoute implements A* pathfinding algorithm
func (r *RiskAwareRouter) FindRoute(start, end Point, alpha float64) ([]Point, float64, float64, error) {
    nearestStart := r.findNearestPoint(start)
    nearestEnd := r.findNearestPoint(end)

    frontier := &PriorityQueue{}
    heap.Init(frontier)

    costSoFar := make(map[Point]float64)
    cameFrom := make(map[Point]Point)

    heap.Push(frontier, &Item{
        point:    nearestStart,
        priority: r.heuristic(nearestStart, nearestEnd),
    })

    costSoFar[nearestStart] = 0

    for frontier.Len() > 0 {
        current := heap.Pop(frontier).(*Item).point

        if current == nearestEnd {
            path, dist, risk := r.reconstructPath(cameFrom, current)
            if len(path) > 0 {
                return path, dist, risk, nil
            }
        }

        r.G.mu.RLock()
        neighbors := r.G.Edges[current]
        r.G.mu.RUnlock()

        for nextPoint, edge := range neighbors {
            newCost := costSoFar[current] + r.calculateEdgeWeight(edge, alpha)

            if cost, exists := costSoFar[nextPoint]; !exists || newCost < cost {
                costSoFar[nextPoint] = newCost
                priority := newCost + r.heuristic(nextPoint, nearestEnd)
                heap.Push(frontier, &Item{
                    point:    nextPoint,
                    priority: priority,
                })
                cameFrom[nextPoint] = current
            }
        }
    }

    return nil, 0, 0, fmt.Errorf("no path found between points")
}

// reconstructPath rebuilds the path from the cameFrom map
func (r *RiskAwareRouter) reconstructPath(cameFrom map[Point]Point, current Point) ([]Point, float64, float64) {
    path := []Point{current}
    totalDist := 0.0
    totalRisk := 0.0

    for {
        prev, exists := cameFrom[current]
        if !exists {
            break
        }

        path = append([]Point{prev}, path...)
        edge := r.G.Edges[prev][current]
        totalDist += edge.Distance
        totalRisk += edge.RiskScore * edge.Distance
        current = prev
    }

    avgRisk := 0.0
    if totalDist > 0 {
        avgRisk = totalRisk / totalDist
    }

    return path, totalDist, avgRisk
}

// heuristic calculates the straight-line distance between points
func (r *RiskAwareRouter) heuristic(a, b Point) float64 {
    return math.Sqrt(math.Pow(a.X-b.X, 2) + math.Pow(a.Y-b.Y, 2))
}

// calculateEdgeWeight determines the cost of traversing an edge
func (r *RiskAwareRouter) calculateEdgeWeight(edge Edge, alpha float64) float64 {
    cacheKey := fmt.Sprintf("%v-%v-%f", edge.Start, edge.End, alpha)
    if weight, ok := r.weightCache.Load(cacheKey); ok {
        return weight.(float64)
    }

    normDistance := edge.Distance / r.G.maxDist
    weight := ((1 - alpha) * normDistance + alpha*edge.RiskScore) * r.G.maxDist

    r.weightCache.Store(cacheKey, weight)
    return weight
}

// HTML template for the map
const mapTemplate = `
<!DOCTYPE html>
<html>
<head>
    <title>Chicago Risk-Aware Routes</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
    <style>
        #map {
            height: 800px;
            width: 100%;
        }
        .legend {
            line-height: 18px;
            color: #555;
            background: white;
            padding: 10px;
            border-radius: 5px;
        }
        .legend i {
            width: 18px;
            height: 18px;
            float: left;
            margin-right: 8px;
            opacity: 0.7;
        }
        .info {
            padding: 6px 8px;
            font: 14px/16px Arial, Helvetica, sans-serif;
            background: white;
            background: rgba(255,255,255,0.8);
            box-shadow: 0 0 15px rgba(0,0,0,0.2);
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js"></script>
    <script>
        var map = L.map('map').setView([{{.Center.Y}}, {{.Center.X}}], {{.Zoom}});
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        var geojsonData = {{.GeoJSONStr}};
        
        // Create heatmap layer from risk data with improved parameters
        var heatmapPoints = [];
        geojsonData.features.forEach(function(feature) {
            if (feature.properties.risk_score !== undefined) {
                var coords = feature.geometry.coordinates;
                // Scale down the intensity and add more points for smoother gradient
                for (var i = 0; i < 3; i++) {
                    var jitter = (Math.random() - 0.5) * 0.0001; // Small random offset
                    heatmapPoints.push([
                        coords[1] + jitter, 
                        coords[0] + jitter, 
                        feature.properties.risk_score * 0.3 // Reduced intensity
                    ]);
                }
            }
        });

        var heatmapLayer = L.heatLayer(heatmapPoints, {
            radius: 25,          // Increased radius
            blur: 20,            // Increased blur
            maxZoom: 15,
            minOpacity: 0.3,     // Set minimum opacity
            max: 1.0,            // Maximum point intensity
            gradient: {          // Smoother gradient similar to Folium
                0.0: '#2b83ba',  // Cool blue
                0.2: '#abdda4',  // Light blue-green
                0.4: '#ffffbf',  // Light yellow
                0.6: '#fdae61',  // Light orange
                0.8: '#d7191c'   // Dark red
            }
        });

        // Create layers for each path type
        var pathColors = {
            0.00: {color: '#0000FF', name: 'Shortest Path (α=0.00)'},
            0.25: {color: '#00FF00', name: 'Low Risk (α=0.25)'},
            0.50: {color: '#FFD700', name: 'Balanced (α=0.50)'},
            0.75: {color: '#FFA500', name: 'Safety Priority (α=0.75)'}
        };

        var pathLayers = {};
        
        geojsonData.features.forEach(function(feature) {
            if (feature.properties.alpha !== undefined) {
                var alpha = feature.properties.alpha;
                var pathStyle = {
                    color: pathColors[alpha].color,
                    weight: 5,
                    opacity: 0.8
                };

                var layer = L.geoJSON(feature, {
                    style: pathStyle,
                    onEachFeature: function(feature, layer) {
                        layer.bindPopup(
                            pathColors[alpha].name + '<br>' +
                            'Distance: ' + feature.properties.distance.toFixed(2) + ' units<br>' +
                            'Risk Score: ' + feature.properties.risk.toFixed(2)
                        );
                    }
                });

                pathLayers[pathColors[alpha].name] = layer;
                layer.addTo(map);
            }
        });

        // Add markers for start and end points
        geojsonData.features.forEach(function(feature) {
            if (feature.properties.name) {
                var coords = feature.geometry.coordinates;
                L.circleMarker([coords[1], coords[0]], {
                    radius: 8,
                    fillColor: feature.properties.color,
                    color: "#000",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                }).bindPopup(feature.properties.name).addTo(map);
            }
        });

        // Add layer controls
        var overlayMaps = {
            "Risk Heatmap": heatmapLayer,
            ...pathLayers
        };

        L.control.layers(null, overlayMaps, {
            collapsed: false
        }).addTo(map);

        // Add legend with updated gradient colors
        var legend = L.control({position: 'bottomright'});
        legend.onAdd = function(map) {
            var div = L.DomUtil.create('div', 'legend info');
            div.innerHTML = '<h4>Risk Levels</h4>';
            div.innerHTML += '<i style="background: linear-gradient(to right, #2b83ba, #abdda4, #ffffbf, #fdae61, #d7191c)"></i>Low → High<br>';
            div.innerHTML += '<h4>Routes</h4>';
            
            Object.values(pathColors).forEach(function(info) {
                div.innerHTML += 
                    '<i style="background: ' + info.color + '"></i>' +
                    info.name + '<br>';
            });
            
            return div;
        };
        legend.addTo(map);
    </script>
</body>
</html>
`

// Update CreateRouteGeoJSON to include risk scores
func (r *RiskAwareRouter) CreateRouteGeoJSON(start, end Point, alphas []float64) ([]byte, error) {
    if err := r.validatePoints(start, end); err != nil {
        return nil, err
    }

    features := make([]map[string]interface{}, 0)

    // Add start/end points
    points := []struct {
        point Point
        name  string
        color string
    }{
        {start, "Start", "#00FF00"},
        {end, "End", "#FF0000"},
    }

    for _, p := range points {
        features = append(features, map[string]interface{}{
            "type": "Feature",
            "properties": map[string]interface{}{
                "name":  p.name,
                "color": p.color,
            },
            "geometry": map[string]interface{}{
                "type":        "Point",
                "coordinates": []float64{p.point.X, p.point.Y},
            },
        })
    }

    // Add different alpha paths
    for _, alpha := range alphas {
        path, distance, risk, err := r.FindRoute(start, end, alpha)
        if err != nil {
            fmt.Printf("Warning: Failed to find route for alpha %.2f: %v\n", alpha, err)
            continue
        }

        if len(path) > 0 {
            coordinates := make([][]float64, len(path))
            for i, p := range path {
                coordinates[i] = []float64{p.X, p.Y}
            }

            features = append(features, map[string]interface{}{
                "type": "Feature",
                "properties": map[string]interface{}{
                    "alpha":       alpha,
                    "distance":    distance,
                    "risk":        risk,
                    "description": fmt.Sprintf("Route α=%.2f", alpha),
                },
                "geometry": map[string]interface{}{
                    "type":        "LineString",
                    "coordinates": coordinates,
                },
            })
        }
    }

    // Add risk score points for heatmap
    r.G.mu.RLock()
    for start, edges := range r.G.Edges {
        for _, edge := range edges {
            features = append(features, map[string]interface{}{
                "type": "Feature",
                "properties": map[string]interface{}{
                    "risk_score": edge.RiskScore,
                },
                "geometry": map[string]interface{}{
                    "type": "Point",
                    "coordinates": []float64{start.X, start.Y},
                },
            })
        }
    }
    r.G.mu.RUnlock()

    if len(features) <= 2 {
        return nil, fmt.Errorf("failed to generate any valid routes")
    }

    geojson := map[string]interface{}{
        "type":     "FeatureCollection",
        "features": features,
    }

    return json.MarshalIndent(geojson, "", "  ")
}

// GenerateMap creates an HTML map file with the routes
func (r *RiskAwareRouter) GenerateMap(start, end Point, alphas []float64, outputPath string) error {
    // Generate GeoJSON
    geojsonOutput, err := r.CreateRouteGeoJSON(start, end, alphas)
    if err != nil {
        return fmt.Errorf("error creating route GeoJSON: %v", err)
    }

    // Parse the GeoJSON to get the center point
    var geojsonData map[string]interface{}
    if err := json.Unmarshal(geojsonOutput, &geojsonData); err != nil {
        return fmt.Errorf("error parsing GeoJSON: %v", err)
    }

    // Calculate the center point between start and end
    center := Point{
        X: (start.X + end.X) / 2,
        Y: (start.Y + end.Y) / 2,
    }

    // Prepare template data
    mapData := MapData{
        Center:     center,
        Zoom:       12,
        GeoJSONStr: template.JS(string(geojsonOutput)),
    }

    // Create and parse template
    tmpl, err := template.New("map").Parse(mapTemplate)
    if err != nil {
        return fmt.Errorf("error parsing template: %v", err)
    }

    // Create output file
    file, err := os.Create(outputPath)
    if err != nil {
        return fmt.Errorf("error creating output file: %v", err)
    }
    defer file.Close()

    // Execute template
    if err := tmpl.Execute(file, mapData); err != nil {
        return fmt.Errorf("error executing template: %v", err)
    }

    return nil
}

func main() {
    crimeData := &CrimeData{}
    router, err := NewRiskAwareRouter("../datasets/chicago_roads_with_risk.geojson", crimeData)
    if err != nil {
        fmt.Printf("Error initializing router: %v\n", err)
        return
    }

    start := Point{X: -87.7154, Y: 41.8881}
    end := Point{X: -87.6298, Y: 41.8781}

    // Validate points
    if err := router.validatePoints(start, end); err != nil {
        fmt.Printf("Error: %v\n", err)
        return
    }

    // Print debug information
    fmt.Printf("Start point: (%f, %f)\n", start.X, start.Y)
    fmt.Printf("End point: (%f, %f)\n", end.X, end.Y)

    alphas := []float64{0.00, 0.25, 0.50, 0.75}

    // Generate interactive HTML map
    err = router.GenerateMap(start, end, alphas, "routes_map.html")
    if err != nil {
        fmt.Printf("Error generating map: %v\n", err)
        return
    }

    fmt.Println("Successfully generated interactive map at routes_map.html")
}