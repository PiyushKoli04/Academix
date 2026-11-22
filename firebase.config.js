/**
 * Paste the Firebase web app configuration from:
 * Firebase console → Project settings → General → Your apps → SDK setup and configuration.
 *
 * The values below are intentionally placeholders. Academix shows a setup screen
 * until a real apiKey, projectId, and appId are supplied.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyDXKyIXY_fs51QTCVmvk1_xJGEDYhso470",
  authDomain: "academix-a4755.firebaseapp.com",
  projectId: "academix-a4755",
  storageBucket: "academix-a4755.firebasestorage.app",
  messagingSenderId: "273433937286",
  appId: "1:273433937286:web:a1aae68a8089e28d549807",
  measurementId: "G-34VTQ08WKK"
};

/**
 * Optional Google Drive settings.
 *
 * driveUpload.clientId is the OAuth 2.0 Web application client ID from the
 * SAME Google Cloud project as the Drive API. The browser uses Google Identity
 * Services to request only https://www.googleapis.com/auth/drive.file.
 *
 * The API key is not required for authenticated Drive API calls. Paste-link
 * uploads continue to work when Drive upload is not configured.
 */
export const appConfig = {
  driveUpload: {
    clientId: "271244422117-01p2bljhjee5fios9bghifslkkt4ls5g.apps.googleusercontent.com",
    maxSizeMB: 100,
  },
  drivePicker: {
    enabled: false,
    apiKey: "",
    clientId: "",
  },
};
