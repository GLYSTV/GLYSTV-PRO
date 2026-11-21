package com.glystv.exo;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.content.res.ColorStateList;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.widget.ImageView;
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
    private static final int HIDE_MS = 4000;
    private static final int BAR_BOTTOM_DP = 10;
    private static final int BAR_RIGHT_DP = 72;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable autoHide = new Runnable() {
        @Override public void run() {
            // Solo se oculta mientras se reproduce; en pausa los controles se quedan visibles
            if (player != null && player.isPlaying()) {
                view.hideController();
                bar.setVisibility(View.GONE);
            }
        }
    };

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
        view.setControllerShowTimeoutMs(HIDE_MS);
        view.setControllerHideOnTouch(true);
        root.addView(view, new FrameLayout.LayoutParams(-1, -1));

        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.addView(mkBtn("Zoom", "glys_ic_zoom", new View.OnClickListener() {
            @Override public void onClick(View v) { cycleZoom(); }
        }));
        bar.addView(mkBtn("Subtítulos", "glys_ic_subtitles", new View.OnClickListener() {
            @Override public void onClick(View v) { pick(C.TRACK_TYPE_TEXT, "Subtítulos"); }
        }));
        bar.addView(mkBtn("Audio", "glys_ic_audio", new View.OnClickListener() {
            @Override public void onClick(View v) { pick(C.TRACK_TYPE_AUDIO, "Audio e idioma"); }
        }));
        // Abajo a la derecha, en la fila del tiempo (junto al engranaje), por debajo de la barra de progreso.
        // Ajusta estos dos valores si quieres moverlos un poco: BAR_BOTTOM_DP (alto) y BAR_RIGHT_DP (distancia al engranaje).
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
        lp.bottomMargin = dp(BAR_BOTTOM_DP);
        lp.rightMargin = dp(BAR_RIGHT_DP);
        root.addView(bar, lp);
        setContentView(root);
        hideUi();

        view.setControllerVisibilityListener(new PlayerView.ControllerVisibilityListener() {
            @Override
            public void onVisibilityChanged(int visibility) {
                bar.setVisibility(visibility);
                if (visibility == View.VISIBLE) {
                    noHighlight(view);
                    scheduleHide();
                } else {
                    handler.removeCallbacks(autoHide);
                }
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
        noHighlight(view);
        view.showController();
        scheduleHide();
    }

    private void scheduleHide() {
        handler.removeCallbacks(autoHide);
        handler.postDelayed(autoHide, HIDE_MS + 500);
    }

    // Quita el cuadro de foco (verde) de los botones propios del reproductor
    private void noHighlight(View v) {
        if (v == bar) return; // los botones Zoom/Subtítulos/Audio conservan su resalte de foco
        if (Build.VERSION.SDK_INT >= 26) v.setDefaultFocusHighlightEnabled(false);
        if (v instanceof ImageView) {
            v.setBackground(null);
            v.setForeground(null);
        }
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) noHighlight(g.getChildAt(i));
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN && bar != null && bar.getVisibility() == View.VISIBLE) scheduleHide();
        return super.dispatchKeyEvent(e);
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    private Button mkBtn(String text, String icon, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(13);
        b.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        b.setMinWidth(0);
        b.setMinHeight(0);
        b.setMinimumWidth(0);
        b.setMinimumHeight(0);
        b.setStateListAnimator(null);
        b.setGravity(Gravity.CENTER_VERTICAL);

        // Texto e icono: blanco normal, oscuro cuando tiene foco (mando de TV) o se pulsa
        ColorStateList ink = new ColorStateList(
                new int[][]{{android.R.attr.state_focused}, {android.R.attr.state_pressed}, {}},
                new int[]{0xFF111111, 0xFF111111, 0xFFFFFFFF});
        b.setTextColor(ink);
        int id = getResources().getIdentifier(icon, "drawable", getPackageName());
        if (id != 0) {
            android.graphics.drawable.Drawable d = getResources().getDrawable(id, getTheme()).mutate();
            int sz = dp(18);
            d.setBounds(0, 0, sz, sz);
            b.setCompoundDrawables(d, null, null, null);
            b.setCompoundDrawablePadding(dp(7));
            if (Build.VERSION.SDK_INT >= 23) b.setCompoundDrawableTintList(ink);
        }

        // Píldora translúcida con borde fino; con foco se rellena de blanco
        StateListDrawable sd = new StateListDrawable();
        sd.addState(new int[]{android.R.attr.state_focused}, pill(0xFFFFFFFF, 0xFFFFFFFF));
        sd.addState(new int[]{android.R.attr.state_pressed}, pill(0xFFFFFFFF, 0xFFFFFFFF));
        sd.addState(new int[]{}, pill(0x8C000000, 0x40FFFFFF));
        b.setBackground(sd);
        b.setPadding(dp(14), dp(8), dp(16), dp(8));
        b.setFocusable(true);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, dp(38));
        p.setMargins(dp(5), 0, dp(5), 0);
        b.setLayoutParams(p);
        b.setOnClickListener(l);
        return b;
    }

    private GradientDrawable pill(int fill, int stroke) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(19));
        g.setStroke(dp(1), stroke);
        return g;
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
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
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
        handler.removeCallbacks(autoHide);
        if (player != null) {
            player.release();
            player = null;
        }
    }
            }
