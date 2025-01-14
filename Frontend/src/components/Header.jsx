import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, MapPin, Shield, Zap } from 'lucide-react';

const navItems = [
  { name: "Home", href: "/", icon: MapPin },
  { name: "Features", href: "#features", icon: Shield },
  { name: "How It Works", href: "#how-it-works", icon: Zap },
];

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      className={`bg-white shadow-sm sticky top-0 z-50 transition-all duration-300 ${
        scrollY > 0 ? "py-2" : "py-4"
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8" aria-label="Top">
        <div className="flex items-center justify-between h-16">
          <motion.div
            className="flex items-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-2xl font-bold text-blue-600">
              Safe<span className="text-gray-900">Journey</span>
            </span>
          </motion.div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              {navItems.map((item) => (
                <motion.div
                  key={item.name}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <a
                    href={item.href}
                    className="text-gray-600 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-300 flex items-center"
                  >
                    <item.icon className="mr-2" size={16} />
                    {item.name}
                  </a>
                </motion.div>
              ))}
            </div>
          </div>
          <div className="hidden md:block">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md transition duration-300 ease-in-out shadow-md hover:bg-blue-700"
            >
              Get Started
            </motion.button>
          </div>
          <div className="md:hidden">
            <motion.button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-600 hover:text-blue-600 focus:outline-none"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </motion.button>
          </div>
        </div>
      </nav>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden bg-white"
          >
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {navItems.map((item) => (
                <motion.div
                  key={item.name}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <a
                    href={item.href}
                    className="text-gray-600 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium flex items-center"
                    onClick={() => setIsOpen(false)}
                  >
                    <item.icon className="mr-2" size={16} />
                    {item.name}
                  </a>
                </motion.div>
              ))}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full mt-4 px-4 py-2 bg-blue-600 text-white font-semibold rounded-md transition duration-300 ease-in-out shadow-md hover:bg-blue-700"
                onClick={() => setIsOpen(false)}
              >
                Get Started
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

