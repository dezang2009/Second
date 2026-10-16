package com.kickoffmanager.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;

/** 앱 assets 폴더의 파일을 https 주소로 제공하고, 외부 링크는 브라우저로 연다. */
public class AssetClient extends WebViewClient {
    private final Activity activity;

    public AssetClient(Activity activity) {
        this.activity = activity;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
        Uri u = req.getUrl();
        if (!MainActivity.HOST.equals(u.getHost())) return null;
        String path = u.getPath();
        if (path == null || path.length() < 2) return null;
        String type = mime(path);
        try {
            InputStream in = activity.getAssets().open(path.substring(1));
            return new WebResourceResponse(type, type.startsWith("text") ? "utf-8" : null, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri u = req.getUrl();
        if (MainActivity.HOST.equals(u.getHost())) return false;
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception ignored) {
            // 열 앱이 없으면 무시
        }
        return true;
    }

    static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }
}
