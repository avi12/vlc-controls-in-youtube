import { defineCustomEventMessaging } from "@webext-core/messaging/page";

// The MAIN-world script has no extension APIs, so anything that has to reach storage or the background is asked
// of the isolated-world bridge over a CustomEvent channel, which never leaves the document it was sent in
export enum WorldMessage {
  SetTabEnabled = "set-tab-enabled"
}

type WorldProtocolMap = {
  // The context menu's own toggle, which switches VLC's controls for this tab only - the bridge owns that switch
  [WorldMessage.SetTabEnabled](isEnabled: boolean): void;
};

const WORLD_NAMESPACE = "vlc-controls";

export const worldMessenger = defineCustomEventMessaging<WorldProtocolMap>({ namespace: WORLD_NAMESPACE });
