package in.co.syntaxsyndicate.academix;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.security.SecureRandom;

public class MainActivity extends Activity {

    private static final String HOST = "academix.syntaxsyndicate.co.in";
    private static final String START_URL = "https://" + HOST + "/";
    private static final String PREFS = "academix_auth";
    private static final String KEY_NONCE = "nonce";

    private WebView webView;
    private boolean pageReady = false;
    private String queuedAuthJs = null;
    private ValueCallback<Uri[]> fileCallback;
    private static final int REQ_FILE = 7001;

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

        webView.setWebChromeClient(new WebChromeClient() {
            // Makes <input type="file"> open the phone's file / media picker.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
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
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (queuedAuthJs != null) {
                    String js = queuedAuthJs;
                    queuedAuthJs = null;
                    view.evaluateJavascript(js, null);
                }
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

        handleAuthReturn(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAuthReturn(intent);
    }

    // ---------------------------------------------------------------------
    // Sign-in: open the real browser, then receive academix://auth?... back
    // ---------------------------------------------------------------------
    private class NativeBridge {
        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public void openBrowserLogin(final String mode) {
            runOnUiThread(() -> {
                if (!fromOwnSite()) return;
                String safeMode = "drive".equals(mode) ? "drive" : "login";
                byte[] bytes = new byte[16];
                new SecureRandom().nextBytes(bytes);
                StringBuilder nonce = new StringBuilder();
                for (byte b : bytes) nonce.append(String.format("%02x", b));
                getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putString(KEY_NONCE, nonce.toString()).apply();
                Uri url = Uri.parse("https://" + HOST + "/app-login.html")
                        .buildUpon()
                        .appendQueryParameter("mode", safeMode)
                        .appendQueryParameter("nonce", nonce.toString())
                        .build();
                openExternal(url);
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

    private void handleAuthReturn(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri uri = intent.getData();
        if (!"academix".equals(uri.getScheme()) || !"auth".equals(uri.getHost())) return;
        // consume so a rotation or relaunch does not replay it
        intent.setData(null);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String expected = prefs.getString(KEY_NONCE, null);
        String got = uri.getQueryParameter("nonce");
        if (expected == null || got == null || !expected.equals(got)) return;
        prefs.edit().remove(KEY_NONCE).apply();

        try {
            JSONObject payload = new JSONObject();
            for (String key : new String[]{"mode", "idToken", "accessToken", "driveToken", "expiresIn", "error"}) {
                String value = uri.getQueryParameter(key);
                if (value != null) payload.put(key, value);
            }
            String json = payload.toString();
            String js = "(function(p){ if (window.__academixBrowserAuth) { window.__academixBrowserAuth(p); }"
                    + " else { window.__academixPendingAuth = p; } })(" + json + ");";
            if (pageReady) {
                webView.evaluateJavascript(js, null);
            } else {
                queuedAuthJs = js;
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
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