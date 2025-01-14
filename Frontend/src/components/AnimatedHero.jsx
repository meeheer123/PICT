import React from "react";
import { motion } from "framer-motion";
import { MapPin, Navigation } from 'lucide-react';

const AnimatedHero = () => {
  return (
    <div className="relative w-full h-[600px] bg-gradient-to-br from-blue-100 to-green-100 rounded-lg overflow-hidden shadow-2xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full h-full flex items-center justify-center"
      >
        <div className="absolute top-1/4 left-1/4 bg-white rounded-full p-3 shadow-lg">
          <MapPin className="text-blue-500" size={32} />
        </div>

        <div className="absolute bottom-1/4 right-1/4 bg-white rounded-full p-3 shadow-lg">
          <Navigation className="text-green-500" size={32} />
        </div>

        <div className="bg-white/80 backdrop-blur-md rounded-xl p-8 shadow-2xl max-w-2xl">
          <h2 className="text-4xl font-bold text-gray-800 mb-6 text-center">
            Navigate Safely with SafeJourney
          </h2>
        </div>
      </motion.div>
    </div>
  );
};

export default AnimatedHero;