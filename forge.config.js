/**
 * Electron Forge configuration for bundling the application.
 * This configuration ensures that the app can be packaged and made into installers.
 */
module.exports = {
    // Define the main application file (main.js)
    packagerConfig: {
      // Exclude source files that are not needed in the final package
      ignore: [
        /\.git$/,
        /node_modules\/electron-forge/,
        /node_modules\/@electron-forge/,
        /node_modules\/maker-/,
        /node_modules\/publisher-/,
      ],
      // Set a custom application icon (optional, you would need to provide an icon.ico/icon.png/icon.icns file)
      // icon: 'assets/icon', 
      appBundleId: 'com.gemini.restaurantdash',
      asar: true, // Package files into a single archive for security and performance
    },
    rebuildConfig: {},
    makers: [
      {
        name: '@electron-forge/maker-squirrel', // Windows installer (.exe)
        config: {},
      },
      {
        name: '@electron-forge/maker-zip', // macOS zip file
        platforms: ['darwin'],
      },
      {
        name: '@electron-forge/maker-deb', // Debian-based Linux installer (.deb)
        // FIX: Added required description for Debian/Linux packaging
        config: {
          description: 'Real-time kitchen order dashboard with thermal printer support (Bluetooth/USB/Network).',
          productDescription: 'Electron app for receiving and printing restaurant orders automatically.',
        },
      },
      {
        name: '@electron-forge/maker-rpm', // Red Hat-based Linux installer (.rpm)
        // FIX: Added required description for RPM/Linux packaging
        config: {
          description: 'Real-time kitchen order dashboard with thermal printer support (Bluetooth/USB/Network).',
          productDescription: 'Electron app for receiving and printing restaurant orders automatically.',
        },
      },
    ],
  };
  