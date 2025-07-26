use crate::auth_middleware::Authenticated;
use crate::db;
use crate::error::ApiError;
use crate::models::{
    AmIInGroupRequest,
    GroupMember,
    GroupSkillData,
    RenameGroupMember,
    SHARED_MEMBER,
};
use crate::validators::{valid_name, validate_member_prop_length, validate_collection_log};
use crate::collection_log::{CollectionLogInfo, CollectionLog};
use crate::discord_webhook::{send_item_request_webhook, ItemRequestData};
use actix_web::{delete, get, post, put, web, Error, HttpResponse};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Pool};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[post("/add-group-member")]
pub async fn add_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    if !valid_name(&group_member.name) {
        return Ok(HttpResponse::BadRequest()
            .body(format!("Member name {} is not valid", group_member.name)));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_group_member(&client, auth.group_id, &group_member.name).await?;
    Ok(HttpResponse::Created().finish())
}

#[delete("/delete-group-member")]
pub async fn delete_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::delete_group_member(&mut client, auth.group_id, &group_member.name).await?;
    Ok(HttpResponse::Ok().finish())
}

#[put("/rename-group-member")]
pub async fn rename_group_member(
    auth: Authenticated,
    rename_member: web::Json<RenameGroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if rename_member.original_name.eq(SHARED_MEMBER) || rename_member.new_name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    if !valid_name(&rename_member.new_name) {
        return Ok(HttpResponse::BadRequest().body(format!(
            "Member name {} is not valid",
            rename_member.new_name
        )));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::rename_group_member(
        &client,
        auth.group_id,
        &rename_member.original_name,
        &rename_member.new_name,
    )
    .await?;
    Ok(HttpResponse::Ok().finish())
}

#[post("/update-group-member")]
pub async fn update_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
    collection_log_info: web::Data<CollectionLogInfo>
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let in_group: bool = db::is_member_in_group(&client, auth.group_id, &group_member.name).await?;
    if !in_group {
        return Ok(HttpResponse::Unauthorized().body("Player is not a member of this group"));
    }
    let mut group_member_inner: GroupMember = group_member.into_inner();

    validate_member_prop_length("stats", &group_member_inner.stats, 7, 7)?;
    validate_member_prop_length("coordinates", &group_member_inner.coordinates, 3, 3)?;
    validate_member_prop_length("skills", &group_member_inner.skills, 23, 24)?;
    validate_member_prop_length("quests", &group_member_inner.quests, 0, 250)?;
    validate_member_prop_length("inventory", &group_member_inner.inventory, 56, 56)?;
    validate_member_prop_length("equipment", &group_member_inner.equipment, 28, 28)?;
    validate_member_prop_length("bank", &group_member_inner.bank, 0, 3000)?;
    validate_member_prop_length("shared_bank", &group_member_inner.shared_bank, 0, 1000)?;
    validate_member_prop_length("rune_pouch", &group_member_inner.rune_pouch, 6, 8)?;
    validate_member_prop_length("seed_vault", &group_member_inner.seed_vault, 0, 500)?;
    validate_member_prop_length("deposited", &group_member_inner.deposited, 0, 200)?;
    validate_member_prop_length("diary_vars", &group_member_inner.diary_vars, 0, 62)?;
    validate_collection_log(&collection_log_info, &mut group_member_inner.collection_log)?;

    db::update_group_member(&client, auth.group_id, group_member_inner, collection_log_info).await?;
    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetGroupDataQuery {
    pub from_time: DateTime<Utc>,
}
#[get("/get-group-data")]
pub async fn get_group_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetGroupDataQuery>,
) -> Result<web::Json<Vec<GroupMember>>, Error> {
    let from_time = query.from_time;
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let group_members = db::get_group_data(&client, auth.group_id, &from_time).await?;
    Ok(web::Json(group_members))
}

#[derive(Deserialize)]
pub enum SkillDataPeriod {
    Day,
    Week,
    Month,
    Year,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetSkillDataQuery {
    pub period: SkillDataPeriod,
}
#[get("/get-skill-data")]
pub async fn get_skill_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetSkillDataQuery>,
) -> Result<web::Json<GroupSkillData>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let aggregate_period = match query.period {
        SkillDataPeriod::Day => db::AggregatePeriod::Day,
        SkillDataPeriod::Week => db::AggregatePeriod::Month,
        SkillDataPeriod::Month => db::AggregatePeriod::Month,
        SkillDataPeriod::Year => db::AggregatePeriod::Year,
    };
    let group_skill_data =
        db::get_skills_for_period(&client, auth.group_id, aggregate_period).await?;
    Ok(web::Json(group_skill_data))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CollectionLogQuery {
    pub member_name: String
}
#[get("/collection-log")]
pub async fn get_collection_log(
    auth: Authenticated,
    db_pool: web::Data<Pool>
) -> Result<web::Json<HashMap<String, Vec<CollectionLog>>>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let collection_logs = db::get_collection_log_for_group(&client, auth.group_id).await?;
    Ok(web::Json(collection_logs))
}

#[get("/am-i-logged-in")]
pub async fn am_i_logged_in(_auth: Authenticated) -> Result<HttpResponse, Error> {
    Ok(HttpResponse::Ok().finish())
}

#[get("/am-i-in-group")]
pub async fn am_i_in_group(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    q: web::Query<AmIInGroupRequest>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let in_group: bool = db::is_member_in_group(&client, auth.group_id, &q.member_name).await?;

    if !in_group {
        return Ok(HttpResponse::Unauthorized().body("Player is not a member of this group"));
    }
    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
pub struct ItemRequest {
    pub item_id: i32,
    pub item_name: String,
    pub quantity: i32,
    pub note: Option<String>,
    pub member_quantities: std::collections::HashMap<String, i32>,
    pub requester_name: String,
}

#[post("/request-item")]
pub async fn request_item(
    auth: Authenticated,
    request: web::Json<ItemRequest>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    
    // Verify the requester is a member of the group
    let in_group: bool = db::is_member_in_group(&client, auth.group_id, &request.requester_name).await?;
    if !in_group {
        return Ok(HttpResponse::Unauthorized().body("Requester is not a member of this group"));
    }
    
    // Get group webhook settings
    let webhook_query = client
        .prepare_cached("SELECT discord_webhook_url, item_requests_enabled FROM groupironman.groups WHERE group_id = $1")
        .await
        .map_err(ApiError::PGError)?;
    let row = client.query_one(&webhook_query, &[&auth.group_id]).await
        .map_err(ApiError::PGError)?;
    
    let webhook_url: Option<String> = row.try_get("discord_webhook_url")
        .map_err(ApiError::PGError)?;
    let item_requests_enabled: bool = row.try_get("item_requests_enabled")
        .map_err(ApiError::PGError)?;
    
    if !item_requests_enabled {
        return Ok(HttpResponse::BadRequest().body("Item requests are not enabled for this group"));
    }
    
    if webhook_url.is_none() {
        return Ok(HttpResponse::BadRequest().body("Discord webhook URL is not configured"));
    }
    
    let webhook_url = webhook_url.unwrap();
    
    // Convert to ItemRequestData for the webhook
    let request_data = ItemRequestData {
        item_id: request.item_id,
        item_name: request.item_name.clone(),
        quantity: request.quantity,
        note: request.note.clone(),
        member_quantities: request.member_quantities.clone(),
    };
    
    // Send the webhook
    send_item_request_webhook(&webhook_url, &request.requester_name, &request_data).await?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Item request sent successfully"
    })))
}

#[derive(Serialize)]
pub struct WebhookSettings {
    pub discord_webhook_url: Option<String>,
    pub item_requests_enabled: bool,
}

#[get("/webhook-settings")]
pub async fn get_webhook_settings(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    
    let query = client
        .prepare_cached("SELECT discord_webhook_url, item_requests_enabled FROM groupironman.groups WHERE group_id = $1")
        .await
        .map_err(ApiError::PGError)?;
    let row = client.query_one(&query, &[&auth.group_id]).await
        .map_err(ApiError::PGError)?;
    
    let settings = WebhookSettings {
        discord_webhook_url: row.try_get("discord_webhook_url")
            .map_err(ApiError::PGError)?,
        item_requests_enabled: row.try_get("item_requests_enabled")
            .map_err(ApiError::PGError)?,
    };
    
    Ok(HttpResponse::Ok().json(settings))
}

#[derive(Deserialize)]
pub struct UpdateWebhookSettings {
    pub discord_webhook_url: Option<String>,
    pub item_requests_enabled: bool,
}

#[put("/webhook-settings")]
pub async fn update_webhook_settings(
    auth: Authenticated,
    settings: web::Json<UpdateWebhookSettings>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    
    // Validate webhook URL if provided
    if let Some(ref url) = settings.discord_webhook_url {
        if !url.is_empty() && !url.starts_with("https://discord.com/api/webhooks/") && !url.starts_with("https://discordapp.com/api/webhooks/") {
            return Ok(HttpResponse::BadRequest().body("Invalid Discord webhook URL"));
        }
    }
    
    let query = client
        .prepare_cached("UPDATE groupironman.groups SET discord_webhook_url = $1, item_requests_enabled = $2 WHERE group_id = $3")
        .await
        .map_err(ApiError::PGError)?;
    client.execute(&query, &[&settings.discord_webhook_url, &settings.item_requests_enabled, &auth.group_id]).await
        .map_err(ApiError::PGError)?;
    
    let response_settings = WebhookSettings {
        discord_webhook_url: settings.discord_webhook_url.clone(),
        item_requests_enabled: settings.item_requests_enabled,
    };
    
    Ok(HttpResponse::Ok().json(response_settings))
}
