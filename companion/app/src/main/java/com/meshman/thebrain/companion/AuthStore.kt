package com.meshman.thebrain.companion

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * The session at rest. The refresh token is the long-lived secret — with
 * it, anyone is Jay — so it lives in EncryptedSharedPreferences behind the
 * Android keystore, the same reasoning that put AES-GCM around the Google
 * tokens in `integrations` (CLAUDE.md §A4).
 */
class AuthStore(context: Context) {

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "auth",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun save(accessToken: String, refreshToken: String) {
        prefs.edit()
            .putString("access", accessToken)
            .putString("refresh", refreshToken)
            // Access tokens live ~an hour; remember when this one arrived.
            .putLong("saved_at", System.currentTimeMillis())
            .apply()
    }

    fun accessToken(): String? = prefs.getString("access", null)
    fun refreshToken(): String? = prefs.getString("refresh", null)

    /** True once the held access token is past ~50 minutes old. */
    fun expiresSoon(): Boolean =
        System.currentTimeMillis() - prefs.getLong("saved_at", 0) > 50 * 60_000L

    fun signedIn(): Boolean = refreshToken() != null

    fun clear() = prefs.edit().clear().apply()
}
