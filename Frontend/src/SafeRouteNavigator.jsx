import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker, Circle } from '@react-google-maps/api';
import { MapPin, Flag, Compass, WifiOff, Download, X, Layers, Battery, Signal } from 'lucide-react';

// Constants
const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

const routeColors = ["#FFA500", "#FF0000", "#FFF000", "#00FF00"];
const NAVIGATION_ARROW = "M0 10L-5 -10L0 -7L5 -10L0 10Z";

const defaultCenter = {
  lat: 41.9088,
  lng: -87.6768
};

const SafeRouteNavigator = () => {
  // Core map states
  const [center, setCenter] = useState(defaultCenter);
  const [mapRef, setMapRef] = useState(null);
  const [zoom, setZoom] = useState(12);
  
  // Route states
  const [routes, setRoutes] = useState([]);
  const [visibleRoutes, setVisibleRoutes] = useState([true, true, true, true]);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);
  
  // Location and sensor states
  const [userPosition, setUserPosition] = useState(null);
  const [deviceOrientation, setDeviceOrientation] = useState(0);
  const [accuracy, setAccuracy] = useState(null);
  const [isHighAccuracy, setIsHighAccuracy] = useState(false);
  const [speed, setSpeed] = useState(null);
  const [altitude, setAltitude] = useState(null);
  const [heading, setHeading] = useState(null);
  
  // PWA and system states
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [isLowPower, setIsLowPower] = useState(false);
  const [isBackgroundTracking, setIsBackgroundTracking] = useState(false);
  const [networkType, setNetworkType] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  // Refs
  const locationHistory = useRef([]);
  const lastGoodPosition = useRef(null);
  const wakeLockRef = useRef(null);
  const syncIntervalRef = useRef(null);
  
  // Enhanced Kalman filter
  const kalmanFilter = useRef({
    position: {
      Q: 0.001, // process noise
      R: 0.1,   // measurement noise
      P: 1,     // estimation error
      K: 0,     // Kalman gain
      estimate: null
    },
    altitude: {
      Q: 0.1,
      R: 1,
      P: 1,
      K: 0,
      estimate: null
    },
    heading: {
      Q: 0.05,
      R: 0.2,
      P: 1,
      K: 0,
      estimate: null
    }
  });

  // Sensor fusion ref
  const sensorFusion = useRef({
    accelerometer: null,
    gyroscope: null,
    magnetometer: null,
    lastReadings: {
      acceleration: { x: 0, y: 0, z: 0 },
      rotation: { alpha: 0, beta: 0, gamma: 0 },
      magnetic: { x: 0, y: 0, z: 0 }
    }
  });

  // Google Maps loader
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: 'AIzaSyAnAszR8yWJ-xrdN61WpGU4ki08WXygS64'
  });

  // Utility Functions
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  const isValidLocation = (position) => {
    if (!position || !position.coords) return false;
    
    if (position.coords.accuracy > 100) return false;
    if (position.coords.speed && position.coords.speed > 33) return false;
    
    if (lastGoodPosition.current) {
      const distance = calculateDistance(
        lastGoodPosition.current.coords.latitude,
        lastGoodPosition.current.coords.longitude,
        position.coords.latitude,
        position.coords.longitude
      );
      
      const timeDiff = (position.timestamp - lastGoodPosition.current.timestamp) / 1000;
      if (timeDiff < 1 && distance > 100) return false;
      
      // Check if movement is consistent with sensor data
      if (sensorFusion.current.accelerometer) {
        const acceleration = sensorFusion.current.lastReadings.acceleration;
        const expectedMovement = 0.5 * acceleration.x * timeDiff * timeDiff;
        if (Math.abs(distance - expectedMovement) > 50) return false;
      }
    }
    
    return true;
  };

  const applyKalmanFilter = (measurement, type = 'position') => {
    const filter = kalmanFilter.current[type];
    
    if (!filter.estimate) {
      filter.estimate = measurement;
      return measurement;
    }

    filter.P = filter.P + filter.Q;
    filter.K = filter.P / (filter.P + filter.R);
    filter.estimate = filter.estimate + filter.K * (measurement - filter.estimate);
    filter.P = (1 - filter.K) * filter.P;

    return filter.estimate;
  };

  // Permission and Initialization Functions
  const requestEnhancedPermissions = async () => {
    try {
      // Wake Lock
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }

      // Motion and Orientation
      if (DeviceMotionEvent.requestPermission) {
        await DeviceMotionEvent.requestPermission();
      }
      if (DeviceOrientationEvent.requestPermission) {
        await DeviceOrientationEvent.requestPermission();
      }

      // Background Location
      if ('permissions' in navigator) {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setIsBackgroundTracking(result.state === 'granted');
      }

      // Sensors
      if ('Accelerometer' in window) {
        sensorFusion.current.accelerometer = new Accelerometer({ frequency: 60 });
        sensorFusion.current.accelerometer.addEventListener('reading', () => {
          sensorFusion.current.lastReadings.acceleration = {
            x: sensorFusion.current.accelerometer.x,
            y: sensorFusion.current.accelerometer.y,
            z: sensorFusion.current.accelerometer.z
          };
        });
        sensorFusion.current.accelerometer.start();
      }

      if ('Gyroscope' in window) {
        sensorFusion.current.gyroscope = new Gyroscope({ frequency: 60 });
        sensorFusion.current.gyroscope.addEventListener('reading', () => {
          sensorFusion.current.lastReadings.rotation = {
            alpha: sensorFusion.current.gyroscope.x,
            beta: sensorFusion.current.gyroscope.y,
            gamma: sensorFusion.current.gyroscope.z
          };
        });
        sensorFusion.current.gyroscope.start();
      }

      if ('Magnetometer' in window) {
        sensorFusion.current.magnetometer = new Magnetometer({ frequency: 60 });
        sensorFusion.current.magnetometer.addEventListener('reading', () => {
          sensorFusion.current.lastReadings.magnetic = {
            x: sensorFusion.current.magnetometer.x,
            y: sensorFusion.current.magnetometer.y,
            z: sensorFusion.current.magnetometer.z
          };
        });
        sensorFusion.current.magnetometer.start();
      }

    } catch (error) {
      console.warn('Enhanced permissions not fully available:', error);
    }
  };

  const initializeBatteryMonitoring = async () => {
    if ('getBattery' in navigator) {
      const battery = await navigator.getBattery();
      
      const updateBatteryStatus = () => {
        setBatteryLevel(battery.level);
        setIsLowPower(battery.level <= 0.2);
        
        // Adjust tracking frequency based on battery level
        if (battery.level <= 0.1) {
          // Reduce tracking frequency
          kalmanFilter.current.position.Q = 0.01;
          kalmanFilter.current.position.R = 0.5;
        }
      };
      
      battery.addEventListener('levelchange', updateBatteryStatus);
      updateBatteryStatus();
      
      return () => battery.removeEventListener('levelchange', updateBatteryStatus);
    }
  };

  const initializeNetworkMonitoring = () => {
    if ('connection' in navigator) {
      const connection = navigator.connection;
      
      const updateNetworkStatus = () => {
        setNetworkType(connection.effectiveType);
        
        // Adjust sync frequency based on network type
        if (connection.effectiveType === '4g') {
          syncIntervalRef.current = setInterval(syncData, 30000);
        } else {
          syncIntervalRef.current = setInterval(syncData, 60000);
        }
      };
      
      connection.addEventListener('change', updateNetworkStatus);
      updateNetworkStatus();
      
      return () => connection.removeEventListener('change', updateNetworkStatus);
    }
  };

  // Location Tracking
  const startEnhancedTracking = () => {
    if (!("geolocation" in navigator)) return;

    const options = {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0,
      distanceFilter: 5
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!isValidLocation(position)) return;

        const smoothedPosition = {
          lat: applyKalmanFilter(position.coords.latitude, 'position'),
          lng: applyKalmanFilter(position.coords.longitude, 'position'),
          altitude: position.coords.altitude ? 
            applyKalmanFilter(position.coords.altitude, 'altitude') : null,
          heading: position.coords.heading ? 
            applyKalmanFilter(position.coords.heading, 'heading') : null
        };

        setUserPosition(smoothedPosition);
        setAccuracy(position.coords.accuracy);
        setSpeed(position.coords.speed);
        setAltitude(smoothedPosition.altitude);
        setHeading(smoothedPosition.heading);

        // Update location history
        locationHistory.current.push({
          ...smoothedPosition,
          timestamp: position.timestamp,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed
        });

        if (locationHistory.current.length > 20) {
          locationHistory.current.shift();
        }

        lastGoodPosition.current = position;

        // Auto-pan map if accuracy is good
        if (position.coords.accuracy <= 20 && mapRef) {
          mapRef.panTo({ lat: smoothedPosition.lat, lng: smoothedPosition.lng });
        }
      },
      (error) => {
        console.error("Location error:", error);
        // Fallback to lower accuracy
        if (isHighAccuracy) {
          setIsHighAccuracy(false);
          startEnhancedTracking();
        }
      },
      options
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  };

  // Data Synchronization
  const syncData = async () => {
    if (!isOnline) return;

    try {
      // Sync location history
      const locationData = {
        history: locationHistory.current,
        currentPosition: userPosition,
        timestamp: Date.now()
      };

      const response = await fetch('https://your-api.com/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(locationData)
      });

      if (response.ok) {
        setLastSync(new Date());
        // Cache successful sync
        if ('caches' in window) {
          const cache = await caches.open('location-cache');
          await cache.put('/sync', new Response(JSON.stringify(locationData)));
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  // Route Fetching
  const fetchRoutes = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('https://pict-production.up.railway.app/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_x: center.lng,
          start_y: center.lat,
          end_x: -87.6297,
          end_y: 41.8781
        })
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      const allRoutes = data.routes.map(route => 
        route.path.map(point => ({
          lat: point.Y,
          lng: point.X
        }))
      );
      
      setRoutes(allRoutes);
      
      if (allRoutes.length > 0) {
        setStartPoint(allRoutes[0][0]);
        setEndPoint(allRoutes[0][allRoutes[0].length - 1]);
      }

      // Cache routes for offline use
      if ('caches' in window) {
        const cache = await caches.open('routes-cache');
        await cache.put('/routes', new Response(JSON.stringify(data)));
      }
    } catch (error) {
      console.error('Error fetching routes:', error);
      // Try to get cached routes if offline
      if (!isOnline && 'caches' in window) {
        try {
          const cache = await caches.open('routes-cache');
          const cachedResponse = await cache.match('/routes');
          if (cachedResponse) {
            const data = await cachedResponse.json();
            const allRoutes = data.routes.map(route => 
              route.path.map(point => ({
                lat: point.Y,
                lng: point.X
              }))
            );
            setRoutes(allRoutes);
            if (allRoutes.length > 0) {
              setStartPoint(allRoutes[0][0]);
              setEndPoint(allRoutes[0][allRoutes[0].length - 1]);
            }
          }
        } catch (cacheError) {
          console.error('Error fetching cached routes:', cacheError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Event Handlers
  const handleDeviceOrientation = useCallback((event) => {
    let orientationValue;
    if (event.webkitCompassHeading) {
      orientationValue = event.webkitCompassHeading;
    } else if (event.alpha) {
      orientationValue = 360 - event.alpha;
    }

    if (orientationValue !== null) {
      // Apply Kalman filtering to smooth orientation changes
      const smoothedOrientation = applyKalmanFilter(orientationValue, 'heading');
      setDeviceOrientation(smoothedOrientation);
    }
  }, []);

  const handleMapLoad = useCallback((map) => {
    const mapOptions = {
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: false,
      rotateControl: false,
      gestureHandling: 'greedy',
      maxZoom: 20,
      minZoom: 3,
      mapId: 'YOUR_MAP_ID', // For custom map styling
      tilt: 45 // Add 45-degree viewing angle
    };
    map.setOptions(mapOptions);
    setMapRef(map);
  }, []);

  const handleCenterMap = useCallback(() => {
    if (mapRef && userPosition) {
      mapRef.panTo(userPosition);
      mapRef.setZoom(18);
    }
  }, [mapRef, userPosition]);

  const handleRouteToggle = useCallback((index) => {
    setVisibleRoutes(prev => {
      const visibleCount = prev.filter(route => route).length;
      if (!prev[index] || visibleCount > 1) {
        const newVisibleRoutes = [...prev];
        newVisibleRoutes[index] = !newVisibleRoutes[index];
        return newVisibleRoutes;
      }
      return prev;
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

  // Cleanup function
  const cleanup = () => {
    // Clear sensors
    Object.values(sensorFusion.current).forEach(sensor => {
      if (sensor && sensor.stop) sensor.stop();
    });

    // Release wake lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }

    // Clear sync interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }
  };

  // Effects
  useEffect(() => {
    const initializeApp = async () => {
      await requestEnhancedPermissions();
      await initializeBatteryMonitoring();
      initializeNetworkMonitoring();
      const trackingCleanup = startEnhancedTracking();
      
      fetchRoutes();

      return () => {
        trackingCleanup();
        cleanup();
      };
    };

    initializeApp();
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, [handleDeviceOrientation]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg">Loading maps...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen">
      {/* Offline banner */}
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-white p-2 text-center z-50 flex items-center justify-center">
          <WifiOff className="mr-2 h-4 w-4" />
          <span>Offline mode - Using cached data</span>
        </div>
      )}

      {/* Status indicators */}
      <div className="absolute top-4 right-4 space-y-2 z-50">
        {batteryLevel !== null && (
          <div className={`bg-white rounded-lg shadow-lg p-2 flex items-center ${
            isLowPower ? 'text-red-500' : 'text-green-500'
          }`}>
            <Battery className="h-4 w-4 mr-2" />
            <span>{Math.round(batteryLevel * 100)}%</span>
          </div>
        )}
        
        {networkType && (
          <div className="bg-white rounded-lg shadow-lg p-2 flex items-center">
            <Signal className="h-4 w-4 mr-2" />
            <span>{networkType.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Main map */}
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={zoom}
        onLoad={handleMapLoad}
        options={{
          zoomControl: true,
          streetViewControl: true
        }}
      >
        {/* Routes */}
        {routes.map((route, index) => (
          visibleRoutes[index] && (
            <Polyline
              key={`route-${index}`}
              path={route}
              options={{
                strokeColor: routeColors[index],
                strokeOpacity: 1.0,
                strokeWeight: 3,
                clickable: true
              }}
            />
          )
        ))}

        {/* User location */}
        {userPosition && (
          <>
            <Circle
              center={userPosition}
              radius={accuracy}
              options={{
                fillColor: '#4285F4',
                fillOpacity: 0.2,
                strokeColor: '#4285F4',
                strokeOpacity: 0.4,
                strokeWeight: 1,
              }}
            />
            <Marker
              position={userPosition}
              icon={{
                path: NAVIGATION_ARROW,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeWeight: 1,
                strokeColor: '#FFFFFF',
                scale: 1.5,
                rotation: deviceOrientation,
                anchor: new window.google.maps.Point(0, 0)
              }}
            />
          </>
        )}

        {/* Start and end markers */}
        {startPoint && (
          <Marker
            position={startPoint}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#00FF00",
              fillOpacity: 1,
              strokeWeight: 1,
              strokeColor: "#FFFFFF",
            }}
            label={{
              text: "S",
              color: "#FFFFFF",
              fontWeight: "bold",
            }}
          />
        )}

        {endPoint && (
          <Marker
            position={endPoint}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#FF0000",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#FFFFFF",
            }}
            label={{
              text: "E",
              color: "#FFFFFF",
              fontWeight: "bold",
            }}
          />
        )}
      </GoogleMap>

      {/* Controls and UI components */}
      <div className="absolute bottom-20 right-4 space-y-2">
        <button
          onClick={handleCenterMap}
          className="bg-white p-3 rounded-full shadow-lg hover:bg-gray-100 transition-colors"
          aria-label="Center map on current location"
        >
          <Compass className="h-6 w-6" />
        </button>
      </div>

      {/* Route selection panel */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs">
        <h2 className="text-xl font-bold mb-4">Routes</h2>
        <div className="space-y-4">
          {routeColors.map((color, index) => (
            <button
              key={index}
              onClick={() => handleRouteToggle(index)}
              className={`w-full flex items-center justify-between p-2 rounded ${
                visibleRoutes[index] ? 'bg-gray-100' : 'bg-white'
              }`}
            >
              <span>Route {index + 1}</span>
              <div 
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: color }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Status panel */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-lg font-semibold mb-2">Status</h3>
        <div className="space-y-2 text-sm">
          <p>Accuracy: {accuracy ? `${Math.round(accuracy)}m` : 'N/A'}</p>
          <p>Speed: {speed ? `${Math.round(speed * 3.6)}km/h` : 'N/A'}</p>
          <p>Altitude: {altitude ? `${Math.round(altitude)}m` : 'N/A'}</p>
          <p>Last sync: {lastSync ? new Date(lastSync).toLocaleTimeString() : 'Never'}</p>
        </div>
      </div>
    </div>
  );
};

export default SafeRouteNavigator;