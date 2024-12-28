package main

import (
    "encoding/json"
    "fmt"
    "math"
    "os"
    "sync"
    "container/heap"
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
    // Find nearest points in the graph
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

// CreateRouteGeoJSON generates GeoJSON output for the routes
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

    colors := map[float64]string{
        0.00: "#0000FF", // blue
        0.25: "#00FF00", // green
        0.50: "#FFFF00", // yellow
        0.75: "#FFA500", // orange
    }

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
                    "color":       colors[alpha],
                    "description": fmt.Sprintf("Route α=%.2f", alpha),
                },
                "geometry": map[string]interface{}{
                    "type":        "LineString",
                    "coordinates": coordinates,
                },
            })
        }
    }

    if len(features) <= 2 { // Only has start/end points
        return nil, fmt.Errorf("failed to generate any valid routes")
    }
geojson := map[string]interface{}{
        "type":     "FeatureCollection",
        "features": features,
    }

    return json.MarshalIndent(geojson, "", "  ")
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

    // Check if start and end points have any edges
    router.G.mu.RLock()
    startEdges := len(router.G.Edges[start])
    endEdges := len(router.G.Edges[end])
    router.G.mu.RUnlock()

    fmt.Printf("Number of edges from start point: %d\n", startEdges)
    fmt.Printf("Number of edges to end point: %d\n", endEdges)

    alphas := []float64{0.00, 0.25, 0.50, 0.75}

    geojsonOutput, err := router.CreateRouteGeoJSON(start, end, alphas)
    if err != nil {
        fmt.Printf("Error creating route GeoJSON: %v\n", err)
        return
    }

    err = os.WriteFile("routes.geojson", geojsonOutput, 0644)
    if err != nil {
        fmt.Printf("Error writing GeoJSON file: %v\n", err)
        return
    }

    fmt.Println("Successfully generated routes and saved to routes.geojson")
}