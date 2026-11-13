package com.cafe.game;

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
public class MainActivity extends Activity implements ValueCallback {
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
        web.evaluateJavascript("window.CAFE && CAFE.save && CAFE.save()", null);
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    public void onBackPressed() {
        // 열린 팝업이 있으면 닫고, 없으면 앱 종료
        web.evaluateJavascript("(window.CAFE && CAFE.back) ? CAFE.back() : false", this);
    }

    // 뒤로가기 결과: 닫을 팝업이 없었으면 앱을 끝낸다
    // (제네릭 ValueCallback<String>을 쓰면 JDK 21 + build-tools 34의 d8이 변환에 실패해서 원시 타입으로 받는다)
    @Override
    public void onReceiveValue(Object value) {
        if (!"true".equals(String.valueOf(value))) finish();
    }
}
