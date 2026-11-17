module.exports = ({ config }) => {
  const preview = process.env.EXPO_PUBLIC_PREVIEW_MODE === "true";
  const unused = [
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.SEND_SMS",
    "android.permission.CALL_PHONE",
    "android.permission.WRITE_CONTACTS",
  ];
  if (!preview)
    return {
      ...config,
      android: { ...config.android, blockedPermissions: unused },
    };
  return {
    ...config,
    name: "SOS Preview",
    ios: { ...config.ios, bundleIdentifier: "org.womensafety.sos.preview" },
    android: {
      ...config.android,
      package: "org.womensafety.sos.preview",
      blockedPermissions: [
        ...unused,
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION",
        "android.permission.VIBRATE",
        "android.permission.INTERNET",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.SEND_SMS",
        "android.permission.CALL_PHONE",
        "android.permission.RECORD_AUDIO",
        "android.permission.CAMERA",
        "android.permission.READ_CONTACTS",
      ],
    },
  };
};
