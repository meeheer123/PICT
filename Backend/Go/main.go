package main

import (
    "container/heap"
    "context"
    "encoding/json"
    "fmt"
    "log"
    "math"
    "net/http"
    "os"
    "os/signal"
    "sync"
    "time"

    "golang.org/x/time/rate"
)

// Structs definitions
type Bounds struct {
    MinX, MinY, MaxX, MaxY float64
}

type Point struct {
    X, Y float64
}

type Route struct {
    Path     []Point `json:"path"`
    Distance float64 `json:"distance"`
    Risk     float64 `json:"risk"`
    Alpha    float64 `json:"alpha"`
}

type Edge struct {
    Start, End Point
    Distance   float64
    RiskScore  float64
}

type Graph struct {
    Edges   map[Point]map[Point]Edge
    mu      sync.RWMutex
    maxDist float64
}

type RiskAwareRouter struct {
    G           *Graph
    CrimeData   *CrimeData
    weightCache sync.Map
    nodeCache   sync.Map
}

type CrimeData struct {
    Points   []Point
    Severity []float64
    mu       sync.RWMutex
}

type Item struct {
    point    Point
    priority float64
    index    int
}

type PriorityQueue []*Item

// Server configuration
type ServerConfig struct {
    Port            string
    ReadTimeout     time.Duration
    WriteTimeout    time.Duration
    MaxHeaderBytes  int
    RateLimit       rate.Limit
    RateBurst      int
}

// Global variables
var (
    router      *RiskAwareRouter
    rateLimiter *rate.Limiter
    chicagoBounds = Bounds{
        MinX: -87.94011,
        MinY: 41.64454,
        MaxX: -87.52414,
        MaxY: 42.02304,
    }
)

// Priority Queue methods
func (pq PriorityQueue) Len() int { return len(pq) }
func (pq PriorityQueue) Less(i, j int) bool { return pq[i].priority < pq[j].priority }
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

// Middleware
func enableCors(handler http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

        if r.Method == "OPTIONS" {
            w.WriteHeader(http.StatusOK)
            return
        }

        handler(w, r)
    }
}

func withLogging(handler http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        log.Printf("Received %s request from %s", r.Method, r.RemoteAddr)
        
        handler(w, r)
        
        duration := time.Since(start)
        log.Printf("Request processed in %v", duration)
    }
}

func withRateLimit(handler http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        if !rateLimiter.Allow() {
            http.Error(w, "Too many requests", http.StatusTooManyRequests)
            return
        }
        handler(w, r)
    }
}

func withRecovery(handler http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if err := recover(); err != nil {
                log.Printf("Recovered from panic: %v", err)
                http.Error(w, "Internal server error", http.StatusInternalServerError)
            }
        }()
        handler(w, r)
    }
}

// Router methods
func NewGraph() *Graph {
    return &Graph{
        Edges: make(map[Point]map[Point]Edge),
    }
}

func (g *Graph) AddEdge(start, end Point, distance, riskScore float64) {
    g.mu.Lock()
    defer g.mu.Unlock()

    if g.Edges[start] == nil {
        g.Edges[start] = make(map[Point]Edge)
    }
    g.Edges[start][end] = Edge{
        Start:     start,
        End:       end,
        Distance:  distance,
        RiskScore: riskScore,
    }

    if g.Edges[end] == nil {
        g.Edges[end] = make(map[Point]Edge)
    }
    g.Edges[end][start] = Edge{
        Start:     end,
        End:       start,
        Distance:  distance,
        RiskScore: riskScore,
    }

    if distance > g.maxDist {
        g.maxDist = distance
    }
}

func (r *RiskAwareRouter) cleanupCaches() {
    r.weightCache.Range(func(key, value interface{}) bool {
        r.weightCache.Delete(key)
        return true
    })
    r.nodeCache.Range(func(key, value interface{}) bool {
        r.nodeCache.Delete(key)
        return true
    })
}

func (r *RiskAwareRouter) validatePoints(start, end Point) error {
    if !isInBounds(start, chicagoBounds) {
        return fmt.Errorf("start point outside bounds")
    }
    if !isInBounds(end, chicagoBounds) {
        return fmt.Errorf("end point outside bounds")
    }
    return nil
}

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
    return nearest
}

func NewRiskAwareRouter(geojsonPath string, crimeData *CrimeData) (*RiskAwareRouter, error) {
    graph := NewGraph()
    if err := loadRoadNetwork(geojsonPath, graph); err != nil {
        return nil, fmt.Errorf("failed to load road network: %w", err)
    }
    return &RiskAwareRouter{
        G:         graph,
        CrimeData: crimeData,
    }, nil
}

func loadRoadNetwork(path string, graph *Graph) error {
    fileInfo, err := os.Stat(path)
    if err != nil {
        return fmt.Errorf("failed to stat file: %w", err)
    }

    // Add size check (100MB limit)
    if fileInfo.Size() > 100*1024*1024 {
        return fmt.Errorf("file too large: %d bytes", fileInfo.Size())
    }

    file, err := os.ReadFile(path)
    if err != nil {
        return fmt.Errorf("failed to read file: %w", err)
    }

    var geojsonData map[string]interface{}
    if err := json.Unmarshal(file, &geojsonData); err != nil {
        return fmt.Errorf("failed to unmarshal GeoJSON: %w", err)
    }

    features, ok := geojsonData["features"].([]interface{})
    if !ok {
        return fmt.Errorf("invalid GeoJSON structure")
    }

    for _, feature := range features {
        if err := processFeature(feature, graph); err != nil {
            log.Printf("Warning: failed to process feature: %v", err)
            continue
        }
    }
    return nil
}

func processFeature(feature interface{}, graph *Graph) error {
    f, ok := feature.(map[string]interface{})
    if !ok {
        return fmt.Errorf("invalid feature format")
    }

    geometry, ok := f["geometry"].(map[string]interface{})
    if !ok || geometry["type"].(string) != "LineString" {
        return fmt.Errorf("invalid geometry format")
    }

    coordinates, ok := geometry["coordinates"].([]interface{})
    if !ok || len(coordinates) < 2 {
        return fmt.Errorf("invalid coordinates")
    }

    riskScore := 0.5
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

        start := Point{X: coord1[0].(float64), Y: coord1[1].(float64)}
        end := Point{X: coord2[0].(float64), Y: coord2[1].(float64)}

        if isInBounds(start, chicagoBounds) && isInBounds(end, chicagoBounds) {
            distance := math.Sqrt(math.Pow(end.X-start.X, 2) + math.Pow(end.Y-start.Y, 2))
            graph.AddEdge(start, end, distance, riskScore)
        }
    }
    return nil
}

// Route finding methods
func (r *RiskAwareRouter) FindRoute(start, end Point, alpha float64) ([]Point, float64, float64, error) {
    if err := r.validatePoints(start, end); err != nil {
        return nil, 0, 0, err
    }

    nearestStart := r.findNearestPoint(start)
    nearestEnd := r.findNearestPoint(end)

    frontier := &PriorityQueue{}
    heap.Init(frontier)
    heap.Push(frontier, &Item{point: nearestStart, priority: r.heuristic(nearestStart, nearestEnd)})

    costSoFar := map[Point]float64{nearestStart: 0}
    cameFrom := make(map[Point]Point)

    for frontier.Len() > 0 {
        current := heap.Pop(frontier).(*Item).point

        if current == nearestEnd {
            return r.reconstructPath(cameFrom, current)
        }

        r.G.mu.RLock()
        neighbors := r.G.Edges[current]
        r.G.mu.RUnlock()

        for nextPoint, edge := range neighbors {
            newCost := costSoFar[current] + r.calculateEdgeWeight(edge, alpha)

            if cost, exists := costSoFar[nextPoint]; !exists || newCost < cost {
                costSoFar[nextPoint] = newCost
                priority := newCost + r.heuristic(nextPoint, nearestEnd)
                heap.Push(frontier, &Item{point: nextPoint, priority: priority})
                cameFrom[nextPoint] = current
            }
        }
    }

    return nil, 0, 0, fmt.Errorf("no path found")
}

func (r *RiskAwareRouter) calculateRoutes(start, end Point, alphas []float64) ([]Route, error) {
    var routes []Route
    
    for _, alpha := range alphas {
        path, distance, risk, err := r.FindRoute(start, end, alpha)
        if err != nil {
            log.Printf("Warning: failed to find route for alpha %f: %v", alpha, err)
            continue
        }
        
        routes = append(routes, Route{
            Path:     path,
            Distance: distance,
            Risk:     risk,
            Alpha:    alpha,
        })
    }
    
    if len(routes) == 0 {
        return nil, fmt.Errorf("no valid routes found")
    }
    
    return routes, nil
}

func (r *RiskAwareRouter) reconstructPath(cameFrom map[Point]Point, current Point) ([]Point, float64, float64, error) {
    path := []Point{current}
    totalDist := 0.0
    totalRisk := 0.0

    for {
        prev, exists := cameFrom[current]
        if !exists {
            break
        }

        path = append([]Point{prev}, path...)
        
        r.G.mu.RLock()
        edge := r.G.Edges[prev][current]
        r.G.mu.RUnlock()
        
        totalDist += edge.Distance
        totalRisk += edge.RiskScore * edge.Distance
        current = prev
    }

    avgRisk := 0.0
    if totalDist > 0 {
        avgRisk = totalRisk / totalDist
    }

    return path, totalDist, avgRisk, nil
}

func (r *RiskAwareRouter) heuristic(a, b Point) float64 {
    return math.Sqrt(math.Pow(a.X-b.X, 2) + math.Pow(a.Y-b.Y, 2))
}

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

// HTTP handlers
func handleRouteRequest(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
    defer cancel()

    var req struct {
        StartX float64 `json:"start_x"`
        StartY float64 `json:"start_y"`
        EndX   float64 `json:"end_x"`
        EndY   float64 `json:"end_y"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
        return
    }

    // Check context for timeout
    select {
    case <-ctx.Done():
        http.Error(w, "Request timeout", http.StatusGatewayTimeout)
        return
    default:
    }

    start := Point{X: req.StartX, Y: req.StartY}
    end := Point{X: req.EndX, Y: req.EndY}
    
    // Validate points
    if err := router.validatePoints(start, end); err != nil {
        http.Error(w, fmt.Sprintf("Invalid points: %v", err), http.StatusBadRequest)
        return
    }

    alphas := []float64{0.00, 0.25, 0.50, 0.75}
    routes, err := router.calculateRoutes(start, end, alphas)
    if err != nil {
        http.Error(w, fmt.Sprintf("Route calculation failed: %v", err), http.StatusInternalServerError)
        return
    }

    center := Point{
        X: (start.X + end.X) / 2,
        Y: (start.Y + end.Y) / 2,
    }

    response := struct {
        Routes     []Route `json:"routes"`
        Center     Point   `json:"center"`
        StartPoint Point   `json:"start"`
        EndPoint   Point   `json:"end"`
    }{
        Routes:     routes,
        Center:     center,
        StartPoint: start,
        EndPoint:   end,
    }

    w.Header().Set("Content-Type", "application/json")
    if err := json.NewEncoder(w).Encode(response); err != nil {
        log.Printf("Error encoding response: %v", err)
        http.Error(w, "Error encoding response", http.StatusInternalServerError)
        return
    }
}

func isInBounds(p Point, bounds Bounds) bool {
    return p.X >= bounds.MinX && p.X <= bounds.MaxX &&
           p.Y >= bounds.MinY && p.Y <= bounds.MaxY
}

// Periodic cache cleanup
func startCacheCleanup(router *RiskAwareRouter, interval time.Duration) {
    ticker := time.NewTicker(interval)
    go func() {
        for range ticker.C {
            router.cleanupCaches()
            log.Printf("Cache cleanup performed")
        }
    }()
}

func getServerConfig() ServerConfig {
    return ServerConfig{
        Port:           getEnvOrDefault("PORT", "8080"),
        ReadTimeout:    time.Duration(getEnvIntOrDefault("READ_TIMEOUT", 30)) * time.Second,
        WriteTimeout:   time.Duration(getEnvIntOrDefault("WRITE_TIMEOUT", 30)) * time.Second,
        MaxHeaderBytes: getEnvIntOrDefault("MAX_HEADER_BYTES", 1<<20), // 1MB
        RateLimit:      rate.Limit(getEnvFloatOrDefault("RATE_LIMIT", 10)),  // requests per second
        RateBurst:      getEnvIntOrDefault("RATE_BURST", 20),
    }
}

func getEnvOrDefault(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}

func getEnvIntOrDefault(key string, defaultValue int) int {
    if value := os.Getenv(key); value != "" {
        if intValue, err := strconv.Atoi(value); err == nil {
            return intValue
        }
    }
    return defaultValue
}

func getEnvFloatOrDefault(key string, defaultValue float64) float64 {
    if value := os.Getenv(key); value != "" {
        if floatValue, err := strconv.ParseFloat(value, 64); err == nil {
            return floatValue
        }
    }
    return defaultValue
}

func main() {
    // Load configuration
    config := getServerConfig()
    
    // Initialize rate limiter
    rateLimiter = rate.NewLimiter(config.RateLimit, config.RateBurst)

    // Initialize router
    var err error
    crimeData := &CrimeData{}
    router, err = NewRiskAwareRouter("chicago_roads_with_risk.geojson", crimeData)
    if err != nil {
        log.Fatalf("Failed to initialize router: %v", err)
    }

    // Start periodic cache cleanup
    startCacheCleanup(router, 1*time.Hour)

    // Create server with timeouts
    server := &http.Server{
        Addr:           ":" + config.Port,
        ReadTimeout:    config.ReadTimeout,
        WriteTimeout:   config.WriteTimeout,
        MaxHeaderBytes: config.MaxHeaderBytes,
    }

    // Set up routes with all middleware
    http.HandleFunc("/route", enableCors(withLogging(withRateLimit(withRecovery(handleRouteRequest)))))

    // Channel for shutdown signals
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

    // Start server
    go func() {
        log.Printf("Server starting on port %s", config.Port)
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Server failed: %v", err)
        }
    }()

    // Wait for shutdown signal
    <-stop
    log.Println("Shutting down server...")

    // Create shutdown context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Attempt graceful shutdown
    if err := server.Shutdown(ctx); err != nil {
        log.Printf("Server forced to shutdown: %v", err)
    }

    log.Println("Server stopped")
}