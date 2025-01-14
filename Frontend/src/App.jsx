import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Information from './pages/Information'
import SafeRouteNavigator from '../src/components/SafeRouteNavigator'

function App() {
  return (
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/information" element={<Information />} />
            <Route path="/safe-route" element={<SafeRouteNavigator />} />
          </Routes>
        </Router>
  );
}

export default App;

