import { pubsub } from "./pubsub";
import { utility } from "../utility";
import { groupData } from "./group-data";
import { exampleData } from "./example-data";

class Api {
  constructor() {
    this.baseUrl = "/api";
    this.createGroupUrl = `${this.baseUrl}/create-group`;
    this.exampleDataEnabled = false;
    this.enabled = false;
  }

  get getGroupDataUrl() {
    return `${this.baseUrl}/group/${this.groupName}/get-group-data`;
  }

  get addMemberUrl() {
    return `${this.baseUrl}/group/${this.groupName}/add-group-member`;
  }

  get deleteMemberUrl() {
    return `${this.baseUrl}/group/${this.groupName}/delete-group-member`;
  }

  get renameMemberUrl() {
    return `${this.baseUrl}/group/${this.groupName}/rename-group-member`;
  }

  get amILoggedInUrl() {
    return `${this.baseUrl}/group/${this.groupName}/am-i-logged-in`;
  }

  get gePricesUrl() {
    return `${this.baseUrl}/ge-prices`;
  }

  get skillDataUrl() {
    return `${this.baseUrl}/group/${this.groupName}/get-skill-data`;
  }

  get captchaEnabledUrl() {
    return `${this.baseUrl}/captcha-enabled`;
  }

  get collectionLogInfoUrl() {
    return `${this.baseUrl}/collection-log-info`;
  }

  collectionLogDataUrl() {
    return `${this.baseUrl}/group/${this.groupName}/collection-log`;
  }

  get requestItemUrl() {
    return `${this.baseUrl}/group/${this.groupName}/request-item`;
  }

  get webhookSettingsUrl() {
    return `${this.baseUrl}/group/${this.groupName}/webhook-settings`;
  }

  setCredentials(groupName, groupToken) {
    this.groupName = groupName;
    this.groupToken = groupToken;
  }

  async restart() {
    const groupName = this.groupName;
    const groupToken = this.groupToken;
    await this.enable(groupName, groupToken);
  }

  async enable(groupName, groupToken) {
    await this.disable();
    this.nextCheck = new Date(0).toISOString();
    this.setCredentials(groupName, groupToken);

    if (!this.enabled) {
      this.enabled = true;
      // getGroupInterval is a Promise so we can make sure this method does not leak
      // any intervals with multiple calls to .enable(). This could be possible because of
      // the wait for the item and quest data loads before we create the interval.
      this.getGroupInterval = pubsub.waitForAllEvents("item-data-loaded", "quest-data-loaded").then(() => {
        return utility.callOnInterval(this.getGroupData.bind(this), 1000);
      });
    }

    await this.getGroupInterval;
  }

  async disable() {
    this.enabled = false;
    this.groupName = undefined;
    this.groupToken = undefined;
    groupData.members = new Map();
    groupData.groupItems = {};
    groupData.filters = [""];
    if (this.getGroupInterval) {
      window.clearInterval(await this.getGroupInterval);
    }
  }

  async getGroupData() {
    const nextCheck = this.nextCheck;

    if (this.exampleDataEnabled) {
      const newGroupData = exampleData.getGroupData();
      groupData.update(newGroupData);
      pubsub.publish("get-group-data", groupData);
    } else {
      const response = await fetch(`${this.getGroupDataUrl}?from_time=${nextCheck}`, {
        headers: {
          Authorization: this.groupToken,
        },
      });
      if (!response.ok) {
        if (response.status === 401) {
          await this.disable();
          window.history.pushState("", "", "/login");
          pubsub.publish("get-group-data");
        }
        return;
      }

      const newGroupData = await response.json();
      this.nextCheck = groupData.update(newGroupData).toISOString();
      pubsub.publish("get-group-data", groupData);
    }
  }

  async createGroup(groupName, memberNames, captchaResponse) {
    const response = await fetch(this.createGroupUrl, {
      body: JSON.stringify({ name: groupName, member_names: memberNames, captcha_response: captchaResponse }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    return response;
  }

  async addMember(memberName) {
    const response = await fetch(this.addMemberUrl, {
      body: JSON.stringify({ name: memberName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "POST",
    });

    return response;
  }

  async removeMember(memberName) {
    const response = await fetch(this.deleteMemberUrl, {
      body: JSON.stringify({ name: memberName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "DELETE",
    });

    return response;
  }

  async renameMember(originalName, newName) {
    const response = await fetch(this.renameMemberUrl, {
      body: JSON.stringify({ original_name: originalName, new_name: newName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "PUT",
    });

    return response;
  }

  async amILoggedIn() {
    const response = await fetch(this.amILoggedInUrl, {
      headers: { Authorization: this.groupToken },
    });

    return response;
  }

  async getGePrices() {
    const response = await fetch(this.gePricesUrl);
    return response;
  }

  async getSkillData(period) {
    if (this.exampleDataEnabled) {
      const skillData = exampleData.getSkillData(period, groupData);
      return skillData;
    } else {
      const response = await fetch(`${this.skillDataUrl}?period=${period}`, {
        headers: {
          Authorization: this.groupToken,
        },
      });
      return response.json();
    }
  }

  async getCaptchaEnabled() {
    const response = await fetch(this.captchaEnabledUrl);
    return response.json();
  }

  async getCollectionLogInfo() {
    const response = await fetch(this.collectionLogInfoUrl);
    return response.json();
  }

  async getCollectionLog() {
    if (this.exampleDataEnabled) {
      const collectionLog = exampleData.getCollectionLog();
      return collectionLog;
    } else {
      const response = await fetch(this.collectionLogDataUrl(), {
        headers: {
          Authorization: this.groupToken,
        },
      });
      return response.json();
    }
  }

  async requestItem(requestData) {
    const response = await fetch(this.requestItemUrl, {
      method: "POST",
      headers: {
        Authorization: this.groupToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send item request: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getWebhookSettings() {
    const response = await fetch(this.webhookSettingsUrl, {
      headers: {
        Authorization: this.groupToken,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get webhook settings: ${response.statusText}`);
    }
    
    return response.json();
  }

  async updateWebhookSettings(settings) {
    const response = await fetch(this.webhookSettingsUrl, {
      method: "PUT",
      headers: {
        Authorization: this.groupToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update webhook settings: ${response.statusText}`);
    }
    
    return response.json();
  }
}

const api = new Api();

export { api };
