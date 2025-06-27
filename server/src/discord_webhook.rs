use crate::error::ApiError;
use serde::{Deserialize, Serialize};
use chrono::Utc;

#[derive(Debug, Serialize)]
struct DiscordEmbed {
    title: String,
    color: u32,
    fields: Vec<DiscordEmbedField>,
    thumbnail: Option<DiscordThumbnail>,
    timestamp: String,
}

#[derive(Debug, Serialize)]
struct DiscordEmbedField {
    name: String,
    value: String,
    inline: bool,
}

#[derive(Debug, Serialize)]
struct DiscordThumbnail {
    url: String,
}

#[derive(Debug, Serialize)]
struct DiscordWebhookPayload {
    embeds: Vec<DiscordEmbed>,
}

#[derive(Debug, Deserialize)]
pub struct ItemRequestData {
    pub item_id: i32,
    pub item_name: String,
    pub quantity: i32,
    pub note: Option<String>,
    pub member_quantities: std::collections::HashMap<String, i32>,
}

pub async fn send_item_request_webhook(
    webhook_url: &str,
    requester_name: &str,
    request_data: &ItemRequestData,
) -> Result<(), ApiError> {
    let holders_text = request_data.member_quantities
        .iter()
        .filter(|(member, qty)| **qty > 0 && member != &"@SHARED")
        .map(|(member, qty)| format!("{}: {}", member, qty))
        .collect::<Vec<_>>()
        .join("\n");

    let mut fields = vec![
        DiscordEmbedField {
            name: "Requester".to_string(),
            value: requester_name.to_string(),
            inline: true,
        },
        DiscordEmbedField {
            name: "Item".to_string(),
            value: format!("{} x{}", request_data.item_name, request_data.quantity),
            inline: true,
        },
        DiscordEmbedField {
            name: "Current Holders".to_string(),
            value: if holders_text.is_empty() { "No one has this item".to_string() } else { holders_text },
            inline: false,
        },
    ];

    if let Some(note) = &request_data.note {
        if !note.is_empty() {
            fields.push(DiscordEmbedField {
                name: "Note".to_string(),
                value: note.clone(),
                inline: false,
            });
        }
    }

    let item_image_url = format!(
        "https://secure.runescape.com/m=itemdb_oldschool/obj_sprite.gif?id={}",
        request_data.item_id
    );

    let embed = DiscordEmbed {
        title: "Item Request".to_string(),
        color: 0xFF7900, // Orange color
        fields,
        thumbnail: Some(DiscordThumbnail {
            url: item_image_url,
        }),
        timestamp: Utc::now().to_rfc3339(),
    };

    let payload = DiscordWebhookPayload {
        embeds: vec![embed],
    };

    let client = reqwest::Client::new();
    let response = client
        .post(webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| ApiError::WebhookError(format!("Failed to send webhook: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(ApiError::WebhookError(format!(
            "Discord webhook failed with status {}: {}",
            status, error_text
        )));
    }

    Ok(())
}

pub fn validate_discord_webhook_url(url: &str) -> bool {
    url.starts_with("https://discord.com/api/webhooks/") ||
    url.starts_with("https://discordapp.com/api/webhooks/")
}