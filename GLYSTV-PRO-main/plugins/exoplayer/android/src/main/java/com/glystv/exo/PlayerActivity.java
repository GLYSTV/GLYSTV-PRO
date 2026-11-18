package com.glystv.exo;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class PlayerActivity extends Activity {
    private ExoPlayer player;
    private PlayerView view;
    private LinearLayout bar;
    private String alt;
    private boolean triedAlt = false;
    private int zoom = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new PlayerView(this);
        view.setBackgroundColor(Color.BLACK);
        view.setShowPreviousButton(false);
        view.setShowNextButton(false);
        view.setShowRewindButton(false);
        view.setShowFastForwardButton(false);
        root.addView(view, new FrameLayout.LayoutParams(-1, -1));

        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.addView(mkBtn("Zoom", new View.OnClickListener() {
            @Override public void onClick(View v) { cycleZoom(); }
        }));
        bar.addView(mkBtn("Subtítulos", new View.OnClickListener() {
            @Override public void onClick(View v) { pick(C.TRACK_TYPE_TEXT, "Subtítulos"); }
        }));
        bar.addView(mkBtn("Audio / idioma", new View.OnClickListener() {
            @Override public void onClick(View v) { pick(C.TRACK_TYPE_AUDIO, "Audio / idioma"); }
        }));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        lp.bottomMargin = dp(64);
        root.addView(bar, lp);
        setContentView(root);
        hideUi();

        view.setControllerVisibilityListener(new PlayerView.ControllerVisibilityListener() {
            @Override
            public void onVisibilityChanged(int visibility) {
                bar.setVisibility(visibility);
            }
        });

        String url = getIntent().getStringExtra("url");
        alt = getIntent().getStringExtra("alt");
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent("Mozilla/5.0 (Linux; Android 13) GLYSTV-PRO")
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(20000);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http)))
                .build();
        view.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException e) {
                if (!triedAlt && alt != null && !alt.isEmpty()) {
                    triedAlt = true;
                    Toast.makeText(PlayerActivity.this, "Probando formato alterno (.ts)...", Toast.LENGTH_SHORT).show();
                    player.setMediaItem(MediaItem.fromUri(alt));
                    player.prepare();
                    player.setPlayWhenReady(true);
                    return;
                }
                String cause = e.getCause() != null ? String.valueOf(e.getCause().getMessage()) : "";
                Toast.makeText(PlayerActivity.this,
                        "No se pudo reproducir: " + e.getErrorCodeName() + (cause.isEmpty() ? "" : "\n" + cause),
                        Toast.LENGTH_LONG).show();
            }
        });
        player.setMediaItem(MediaItem.fromUri(url));
        player.prepare();
        player.setPlayWhenReady(true);
        view.showController();
        quitarCuadroPause();
    }

    // Quita el cuadro de enfoque (verde) que se dibuja alrededor del botón pause/play
    private void quitarCuadroPause() {
        int id = getResources().getIdentifier("exo_play_pause", "id", getPackageName());
        if (id == 0) id = getResources().getIdentifier("exo_play_pause", "id", "androidx.media3.ui");
        View b = id != 0 ? view.findViewById(id) : null;
        if (b == null) return;
        b.setBackground(null);
        if (android.os.Build.VERSION.SDK_INT >= 23) b.setForeground(null);
        if (android.os.Build.VERSION.SDK_INT >= 26) b.setDefaultFocusHighlightEnabled(false);
        b.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean f) { v.setBackground(null); }
        });
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    private Button mkBtn(String text, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setAllCaps(false);
        b.setTextSize(14);
        StateListDrawable sd = new StateListDrawable();
        sd.addState(new int[]{android.R.attr.state_focused}, new ColorDrawable(0xFF2D7CFF));
        sd.addState(new int[]{android.R.attr.state_pressed}, new ColorDrawable(0xFF2D7CFF));
        sd.addState(new int[]{}, new ColorDrawable(0x99000000));
        b.setBackground(sd);
        b.setPadding(dp(14), dp(6), dp(14), dp(6));
        b.setFocusable(true);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, -2);
        p.setMargins(dp(6), 0, dp(6), 0);
        b.setLayoutParams(p);
        b.setOnClickListener(l);
        return b;
    }

    private void cycleZoom() {
        zoom = (zoom + 1) % 3;
        int[] modes = {AspectRatioFrameLayout.RESIZE_MODE_FIT, AspectRatioFrameLayout.RESIZE_MODE_ZOOM, AspectRatioFrameLayout.RESIZE_MODE_FILL};
        String[] names = {"Ajustar", "Zoom (recortar)", "Estirar"};
        view.setResizeMode(modes[zoom]);
        Toast.makeText(this, names[zoom], Toast.LENGTH_SHORT).show();
    }

    private void pick(final int type, String title) {
        if (player == null) return;
        Tracks tracks = player.getCurrentTracks();
        final List<String> names = new ArrayList<>();
        final List<Tracks.Group> gs = new ArrayList<>();
        final List<Integer> ti = new ArrayList<>();
        int sel = -1;
        if (type == C.TRACK_TYPE_TEXT) {
            names.add("Desactivados");
            gs.add(null);
            ti.add(-1);
            if (player.getTrackSelectionParameters().disabledTrackTypes.contains(C.TRACK_TYPE_TEXT)) sel = 0;
        }
        for (Tracks.Group g : tracks.getGroups()) {
            if (g.getType() != type) continue;
            for (int i = 0; i < g.length; i++) {
                if (!g.isTrackSupported(i)) continue;
                Format f = g.getTrackFormat(i);
                String n;
                if (f.label != null) n = f.label;
                else if (f.language != null && !"und".equals(f.language)) n = new Locale(f.language).getDisplayLanguage();
                else n = "Pista " + (names.size() + 1);
                names.add(n);
                gs.add(g);
                ti.add(i);
                if (g.isTrackSelected(i)) sel = names.size() - 1;
            }
        }
        boolean any = false;
        for (Tracks.Group g : gs) if (g != null) any = true;
        if (!any) {
            Toast.makeText(this, type == C.TRACK_TYPE_TEXT ? "Sin subtítulos disponibles" : "Sin otras pistas de audio", Toast.LENGTH_SHORT).show();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle(title)
                .setSingleChoiceItems(names.toArray(new String[0]), sel, new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface d, int which) {
                        TrackSelectionParameters.Builder tb = player.getTrackSelectionParameters().buildUpon();
                        if (gs.get(which) == null) {
                            tb.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
                        } else {
                            tb.setTrackTypeDisabled(type, false);
                            tb.setOverrideForType(new TrackSelectionOverride(gs.get(which).getMediaTrackGroup(), ti.get(which)));
                        }
                        player.setTrackSelectionParameters(tb.build());
                        d.dismiss();
                    }
                })
                .show();
    }

    private void hideUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideUi();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (player != null) player.pause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
