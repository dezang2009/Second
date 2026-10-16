package com.kickoffmanager.app;

import android.app.Activity;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * 게임(HTML/JS)을 앱 안에 담아 실행하는 WebView 화면.
 * 앱 파일은 https://appassets.androidplatform.net/ 주소로 제공해서(AssetClient)
 * localStorage(세이브)와 최신 웹 기능이 일반 웹사이트처럼 동작하게 한다.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        web.setWebViewClient(new AssetClient(this));
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // 앱이 백그라운드로 갈 때 게임을 저장한다
        web.evaluateJavascript("window.KM && KM.UI && KM.UI.autosave && KM.UI.autosave()", null);
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    public void onBackPressed() {
        // 열린 창 닫기 → 홈 탭으로 → 앱 종료 순서로 처리
        web.evaluateJavascript("(window.KM && KM.UI && KM.UI.back) ? KM.UI.back() : false", new BackResult());
    }

    private final class BackResult implements ValueCallback<String> {
        @Override
        public void onReceiveValue(String value) {
            if (!"true".equals(value)) finish();
        }
    }
}
