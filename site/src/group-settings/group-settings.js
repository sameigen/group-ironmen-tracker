import { BaseElement } from "../base-element/base-element";
import { appearance } from "../appearance";

export class GroupSettings extends BaseElement {
  constructor() {
    super();
  }

  /* eslint-disable no-unused-vars */
  html() {
    const selectedPanelDockSide = appearance.getLayout();
    const style = appearance.getTheme();
    return `{{group-settings.html}}`;
  }
  /* eslint-enable no-unused-vars */

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.memberSection = this.querySelector(".group-settings__members");
    this.panelDockSide = this.querySelector(".group-settings__panels");
    this.appearanceStyle = this.querySelector(".group-settings__style");
    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
    this.subscribe("group-settings-loaded", this.handleGroupSettingsLoaded.bind(this));
    this.eventListener(this.panelDockSide, "change", this.handlePanelDockSideChange.bind(this));
    this.eventListener(this.appearanceStyle, "change", this.handleStyleChange.bind(this));
    
    // Discord webhook settings
    const saveWebhookButton = this.querySelector(".group-settings__save-webhook");
    this.eventListener(saveWebhookButton, "click", this.handleSaveWebhookSettings.bind(this));
    
    // Load webhook settings
    this.loadWebhookSettings();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleStyleChange() {
    const style = this.querySelector(`input[name="appearance-style"]:checked`).value;
    appearance.setTheme(style);
  }

  handlePanelDockSideChange() {
    const side = this.querySelector(`input[name="panel-dock-side"]:checked`).value;

    if (side === "right") {
      appearance.setLayout("row-reverse");
    } else {
      appearance.setLayout("row");
    }
  }

  handleUpdatedMembers(members) {
    members = members.filter((member) => member.name !== "@SHARED");
    let memberEdits = document.createDocumentFragment();
    for (let i = 0; i < members.length; ++i) {
      const member = members[i];
      const memberEdit = document.createElement("edit-member");
      memberEdit.member = member;
      memberEdit.memberNumber = i + 1;

      memberEdits.appendChild(memberEdit);
    }

    if (members.length < 5) {
      const addMember = document.createElement("edit-member");
      addMember.memberNumber = members.length + 1;
      memberEdits.appendChild(addMember);
    }

    this.memberSection.innerHTML = "";
    this.memberSection.appendChild(memberEdits);
  }

  async loadWebhookSettings() {
    const { api } = await import("../data/api.js");
    try {
      const settings = await api.getWebhookSettings();
      this.discordWebhookUrl = settings.discord_webhook_url || "";
      this.itemRequestsEnabled = settings.item_requests_enabled || false;
      this.render();
    } catch (error) {
      console.error("Failed to load webhook settings:", error);
    }
  }

  handleGroupSettingsLoaded(settings) {
    this.discordWebhookUrl = settings.discord_webhook_url || "";
    this.itemRequestsEnabled = settings.item_requests_enabled || false;
    this.render();
  }

  async handleSaveWebhookSettings() {
    const webhookUrlInput = this.querySelector("#discord-webhook-url");
    const itemRequestsEnabledInput = this.querySelector("#item-requests-enabled");
    
    const webhookUrl = webhookUrlInput.value.trim();
    const itemRequestsEnabled = itemRequestsEnabledInput.checked;
    
    // Basic validation
    if (webhookUrl && !webhookUrl.match(/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/.+/)) {
      alert("Please enter a valid Discord webhook URL");
      return;
    }
    
    const { api } = await import("../data/api.js");
    try {
      await api.updateWebhookSettings({
        discord_webhook_url: webhookUrl || null,
        item_requests_enabled: itemRequestsEnabled
      });
      
      this.discordWebhookUrl = webhookUrl;
      this.itemRequestsEnabled = itemRequestsEnabled;
      
      // Show success feedback
      const button = this.querySelector(".group-settings__save-webhook");
      const originalText = button.textContent;
      button.textContent = "Saved!";
      button.disabled = true;
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    } catch (error) {
      console.error("Failed to save webhook settings:", error);
      alert("Failed to save Discord settings. Please try again.");
    }
  }
}

customElements.define("group-settings", GroupSettings);
