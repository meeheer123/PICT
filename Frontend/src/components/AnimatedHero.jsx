import React, { useState, useEffect } from "react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { MapPin, Navigation, Shield, Zap } from 'lucide-react';

const AnimatedHero = () => {
  const [isAnimating, setIsAnimating] = useState(false);
  const controls = useAnimation();

  useEffect(() => {
    const sequence = async () => {
      await controls.start({ opacity: 1, scale: 1, transition: { duration: 0.5 } });
      await controls.start("visible");
      setIsAnimating(true);
    };
    sequence();
  }, [controls]);

  const mapPinVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: { type: "spring", stiffness: 260, damping: 20 },
    },
  };

  const pathVariants = {
    hidden: { pathLength: 0 },
    visible: { pathLength: 1, transition: { duration: 2, ease: "easeInOut" } },
  };

  const featureVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="relative w-full h-[600px] bg-gradient-to-br from-blue-100 to-green-100 rounded-lg overflow-hidden shadow-2xl">
      <div className="absolute inset-0 bg-white/40 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={controls}
        className="relative w-full h-full"
      >
        <motion.div
          variants={mapPinVariants}
          initial="hidden"
          animate="visible"
          className="absolute top-1/4 left-1/4 bg-white rounded-full p-3 shadow-lg"
        >
          <MapPin className="text-blue-500" size={32} />
        </motion.div>

        <motion.div
          variants={mapPinVariants}
          initial="hidden"
          animate="visible"
          className="absolute bottom-1/4 right-1/4 bg-white rounded-full p-3 shadow-lg"
        >
          <Navigation className="text-green-500" size={32} />
        </motion.div>

        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
          </defs>
          <motion.path
            d="M 25% 25% Q 50% 50%, 75% 75%"
            fill="transparent"
            stroke="url(#gradient)"
            strokeWidth="4"
            strokeLinecap="round"
            variants={pathVariants}
            initial="hidden"
            animate={isAnimating ? "visible" : "hidden"}
          />
        </svg>

        <AnimatePresence>
          {isAnimating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 2, duration: 0.5 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="bg-white/80 backdrop-blur-md rounded-xl p-8 shadow-2xl max-w-2xl">
                <h2 className="text-4xl font-bold text-gray-800 mb-6 text-center">
                  Navigate Safely with SafeJourney
                </h2>
                <div className="grid grid-cols-2 gap-6">
                  {[
                    { icon: Shield, title: "Intelligent Safe Routes", description: "AI-powered route suggestions" },
                    { icon: Zap, title: "Real-time Updates", description: "Instant safety alerts" },
                    { icon: MapPin, title: "Personalized Safety", description: "Tailored to your preferences" },
                    { icon: Navigation, title: "Easy Navigation", description: "User-friendly interface" },
                  ].map((feature, index) => (
                    <motion.div
                      key={index}
                      variants={featureVariants}
                      initial="hidden"
                      animate="visible"
                      transition={{ delay: 2.5 + index * 0.1 }}
                      className="flex items-start space-x-3"
                    >
                      <feature.icon className="text-blue-500 flex-shrink-0" size={24} />
                      <div>
                        <h3 className="font-semibold text-gray-800">{feature.title}</h3>
                        <p className="text-sm text-gray-600">{feature.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default AnimatedHero;

