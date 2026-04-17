module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: "#102042",
          blue: "#3164f4",
          sky: "#d8e5ff",
          amber: "#ffb020",
          cream: "#fffaf0"
        }
      },
      boxShadow: {
        soft: "0 14px 40px rgba(22, 37, 72, 0.15)"
      },
      fontFamily: {
        display: [
          "Trebuchet MS",
          "Verdana",
          "sans-serif"
        ],
        body: [
          "Arial",
          "Helvetica",
          "sans-serif"
        ]
      },
      backgroundImage: {
        "grid-fade": "radial-gradient(circle at top, rgba(49, 100, 244, 0.18), transparent 40%), linear-gradient(rgba(49, 100, 244, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(49, 100, 244, 0.06) 1px, transparent 1px)"
      },
      backgroundSize: {
        "grid-fade": "auto, 42px 42px, 42px 42px"
      }
    }
  },
  plugins: []
};
