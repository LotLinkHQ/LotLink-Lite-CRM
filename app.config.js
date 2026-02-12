const EAS_PROJECT_ID = "be2b62b6-f801-4ae5-876e-e4c45970a0a2";

export default {
  expo: {
    name: "RV Sales CRM",
    slug: "rv-sales-crm",
    version: "1.0.0",
    scheme: "rv-sales-crm",
    userInterfaceStyle: "light",
    orientation: "portrait",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0B5E7E",
    },
    ios: {
      bundleIdentifier: "com.lotlink.rvsalescrm",
      buildNumber: "1",
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription:
          "This app uses the camera to scan VIN barcodes for quick inventory entry.",
        ITSAppUsesNonExemptEncryption: false,
      },
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.lotlink.rvsalescrm",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0B5E7E",
      },
      permissions: ["CAMERA"],
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/favicon.png",
    },
    plugins: ["expo-router"],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      apiUrl: process.env.API_URL || "http://localhost:5000",
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
    owner: "lotlink-mini-crm",
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
  },
};
