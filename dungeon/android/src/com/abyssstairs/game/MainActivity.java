package com.abyssstairs.game;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** 게임(HTML/JS)을 앱 안에 담아 실행하는 WebView 화면. 세이브는 localStorage에 저장된다. */
public class MainActivity extends Activity {
    private static final String START = "file:///android_asset/www/index.html";
    private WebView web;
    private long lastBack;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xff0e0d14);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        setContentView(web);
        web.loadUrl(START);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.G && G.save()", null);
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    public void onBackPressed() {
        // 가방·상점 닫기 → 한 번 더 누르면 종료
        web.evaluateJavascript("window.G ? G.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if ("true".equals(value)) return;
                long now = System.currentTimeMillis();
                if (now - lastBack < 2000) {
                    finish();
                } else {
                    lastBack = now;
                    Toast.makeText(MainActivity.this, "한 번 더 누르면 종료합니다", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }
}
