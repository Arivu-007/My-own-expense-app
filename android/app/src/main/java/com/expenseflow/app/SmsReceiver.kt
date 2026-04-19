package com.expenseflow.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ExpenseFlow"
        private const val WEBHOOK_URL =
            "https://us-central1-expense-143df.cloudfunctions.net/smsWebhook"

        // Keywords that flag a transaction SMS (must contain $ and one of these)
        private val TRANSACTION_KEYWORDS = listOf(
            "purchase", "charged", "transaction", "used at",
            "spent at", "charge at", "authorized"
        )
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        for (msg in messages) {
            val sender = msg.originatingAddress ?: ""
            val body   = msg.messageBody ?: ""

            Log.d(TAG, "SMS from: $sender")

            // Must contain a dollar amount AND a transaction keyword
            val hasDollar  = body.contains("$")
            val hasKeyword = TRANSACTION_KEYWORDS.any { body.lowercase().contains(it) }

            if (hasDollar && hasKeyword) {
                Log.d(TAG, "✅ Transaction SMS — forwarding to webhook")
                postToWebhook(sender, body)
            } else {
                Log.d(TAG, "⏭️ Not a transaction SMS — skipping")
            }
        }
    }

    private fun postToWebhook(from: String, text: String) {
        Thread {
            try {
                val safeText = text
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "")

                val safeFrom = from
                    .replace("\"", "\\\"")

                val jsonBody = """{"from":"$safeFrom","text":"$safeText"}"""

                val url  = URL(WEBHOOK_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod  = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput       = true
                conn.connectTimeout = 10_000
                conn.readTimeout    = 10_000

                val out: OutputStream = conn.outputStream
                out.write(jsonBody.toByteArray(Charsets.UTF_8))
                out.flush()
                out.close()

                Log.d(TAG, "Webhook HTTP ${conn.responseCode}")
                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Webhook error: ${e.message}")
            }
        }.start()
    }
}
