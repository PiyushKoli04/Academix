package in.co.syntaxsyndicate.academix;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.IntentSender;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import java.util.Collections;

public class MainActivity extends Activity {

    private static final String HOST = "academix.syntaxsyndicate.co.in";
    private static final String START_URL = "https://" + HOST + "/";

    // Web OAuth client ID (same one used by the site for Drive).
    private static final String WEB_CLIENT_ID =
            "271244422117-01p2bljhjee5fios9bghifslkkt4ls5g.apps.googleusercontent.com";
    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
    private static final int REQ_DRIVE_AUTH = 4242;

    private WebView webView;
    private String pendingDriveCallbackId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new NativeBridge(), "AcademixNative");

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if (scheme == null) return false;
                if (!scheme.equals("http") && !scheme.equals("https")) {
                    openExternal(uri);
                    return true;
                }
                String host = uri.getHost();
                if (host != null && (host.equals(HOST) || host.endsWith("." + HOST))) {
                    return false;
                }
                // Keep Google Drive previews, Firebase and fonts inside the app.
                if (host != null && (host.endsWith("google.com")
                        || host.endsWith("googleusercontent.com")
                        || host.endsWith("gstatic.com")
                        || host.endsWith("firebaseapp.com")
                        || host.endsWith("googleapis.com"))) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadData(
                        "<html><body style='font-family:sans-serif;text-align:center;padding:48px 24px;color:#333'>"
                        + "<h2>You're offline</h2><p>Check your internet connection and try again.</p>"
                        + "<p><a href='" + START_URL + "'>Retry</a></p></body></html>",
                        "text/html", "UTF-8");
                }
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    // ---------------------------------------------------------------------
    // Bridge: the website calls these to use the phone's own Google accounts
    // ---------------------------------------------------------------------
    private class NativeBridge {
        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public void requestGoogleIdToken(final String callbackId) {
            runOnUiThread(() -> {
                if (!fromOwnSite()) {
                    deliver(callbackId, "", "Blocked: not the Academix site.");
                    return;
                }
                startGoogleIdToken(callbackId);
            });
        }

        @JavascriptInterface
        public void requestDriveToken(final String callbackId) {
            runOnUiThread(() -> {
                if (!fromOwnSite()) {
                    deliver(callbackId, "", "Blocked: not the Academix site.");
                    return;
                }
                startDriveAuthorization(callbackId);
            });
        }
    }

    private boolean fromOwnSite() {
        try {
            String url = webView.getUrl();
            if (url == null) return false;
            String host = Uri.parse(url).getHost();
            return host != null && (host.equals(HOST) || host.endsWith("." + HOST));
        } catch (Exception e) {
            return false;
        }
    }

    private void startGoogleIdToken(final String callbackId) {
        try {
            GetGoogleIdOption option = new GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(false)
                    .setServerClientId(WEB_CLIENT_ID)
                    .build();
            GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(option)
                    .build();
            CredentialManager manager = CredentialManager.create(this);
            manager.getCredentialAsync(
                    this,
                    request,
                    new CancellationSignal(),
                    command -> runOnUiThread(command),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse result) {
                            Credential credential = result.getCredential();
                            if (credential instanceof CustomCredential
                                    && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                                        .equals(credential.getType())) {
                                GoogleIdTokenCredential google = GoogleIdTokenCredential
                                        .createFrom(((CustomCredential) credential).getData());
                                deliver(callbackId, google.getIdToken(), "");
                            } else {
                                deliver(callbackId, "", "Unexpected sign-in response.");
                            }
                        }

                        @Override
                        public void onError(GetCredentialException e) {
                            String message;
                            if (e instanceof GetCredentialCancellationException) {
                                message = "Google sign-in was cancelled.";
                            } else if (e instanceof NoCredentialException) {
                                message = "No Google account found on this phone. Add one in Settings > Accounts, then try again.";
                            } else {
                                message = "Google sign-in failed: " + e.getType()
                                        + (e.getMessage() != null ? " (" + e.getMessage() + ")" : "");
                            }
                            deliver(callbackId, "", message);
                        }
                    });
        } catch (Exception e) {
            deliver(callbackId, "", "Google sign-in could not start: " + e.getMessage());
        }
    }

    private void startDriveAuthorization(final String callbackId) {
        try {
            AuthorizationRequest request = AuthorizationRequest.builder()
                    .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
                    .build();
            Identity.getAuthorizationClient(this)
                    .authorize(request)
                    .addOnSuccessListener(result -> {
                        if (result.hasResolution()) {
                            PendingIntent pending = result.getPendingIntent();
                            if (pending == null) {
                                deliver(callbackId, "", "Drive permission screen unavailable.");
                                return;
                            }
                            try {
                                pendingDriveCallbackId = callbackId;
                                startIntentSenderForResult(
                                        pending.getIntentSender(), REQ_DRIVE_AUTH, null, 0, 0, 0);
                            } catch (IntentSender.SendIntentException e) {
                                pendingDriveCallbackId = null;
                                deliver(callbackId, "", "Could not open the Drive permission screen.");
                            }
                        } else {
                            deliverDriveResult(callbackId, result);
                        }
                    })
                    .addOnFailureListener(e ->
                            deliver(callbackId, "", "Drive access failed: " + e.getMessage()));
        } catch (Exception e) {
            deliver(callbackId, "", "Drive access could not start: " + e.getMessage());
        }
    }

    private void deliverDriveResult(String callbackId, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            deliver(callbackId, "", "Google did not return a Drive token.");
        } else {
            deliver(callbackId, token, "");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_DRIVE_AUTH) return;
        String callbackId = pendingDriveCallbackId;
        pendingDriveCallbackId = null;
        if (callbackId == null) return;
        if (resultCode != RESULT_OK || data == null) {
            deliver(callbackId, "", "Drive access was not granted.");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(this)
                    .getAuthorizationResultFromIntent(data);
            deliverDriveResult(callbackId, result);
        } catch (Exception e) {
            deliver(callbackId, "", "Drive access failed: " + e.getMessage());
        }
    }

    /** Sends the result back to the page: window.__academixNativeResult(id, value, error). */
    private void deliver(String callbackId, String value, String error) {
        final String js = "window.__academixNativeResult && window.__academixNativeResult("
                + JSONObject.quote(callbackId) + "," + JSONObject.quote(value) + ","
                + JSONObject.quote(error) + ");";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        });
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
