import { useState, useEffect } from "react";
import { motion, useAnimation } from "framer-motion";
import { MapPin, Navigation } from "lucide-react";

export default function AnimatedHero() {
  const [isAnimating, setIsAnimating] = useState(false);
  const controls = useAnimation();

  useEffect(() => {
    const sequence = async () => {
      await controls.start({
        opacity: 1,
        scale: 1,
        transition: { duration: 0.5 },
      });
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

  return (
    <div className="relative w-full h-[500px] bg-gray-100 rounded-lg overflow-hidden shadow-xl">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url("/map-background.jpg")' }}
      />
      <div className="absolute inset-0 bg-blue-500 opacity-20" />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={controls}
        className="relative w-full h-full"
      >
        <motion.div
          variants={mapPinVariants}
          initial="hidden"
          animate="visible"
          className="absolute top-1/4 left-1/4 bg-white rounded-full p-2 shadow-lg"
        >
          <MapPin className="text-red-500" size={32} />
        </motion.div>

        <motion.div
          variants={mapPinVariants}
          initial="hidden"
          animate="visible"
          className="absolute bottom-1/4 right-1/4 bg-white rounded-full p-2 shadow-lg"
        >
          <Navigation className="text-green-500" size={32} />
        </motion.div>

        <svg className="absolute inset-0 w-full h-full">
          <motion.path
            d="M 25% 25% Q 50% 50%, 75% 75%"
            fill="transparent"
            stroke="#3B82F6"
            strokeWidth="4"
            variants={pathVariants}
            initial="hidden"
            animate={isAnimating ? "visible" : "hidden"}
          />
        </svg>

        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 2, duration: 0.5 }}
          className="absolute bottom-4 right-4 bg-white rounded-lg p-4 shadow-lg"
        >
          <p className="text-sm font-semibold text-gray-800">
            Route found: 15 minutes faster & 30% safer!
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
