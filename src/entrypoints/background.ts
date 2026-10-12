import { isEnabledItem } from "@/lib/storage";
import { browser, defineBackground } from "#imports";

const BADGE_TEXT_OFF = "OFF";
const BADGE_COLOR_OFF = "#5f6368";

async function reflectEnabledState(isEnabled: boolean) {
  const stateLabel = isEnabled ? "on" : "off";
  await Promise.all([
    browser.action.setBadgeText({ text: isEnabled ? "" : BADGE_TEXT_OFF }),
    browser.action.setBadgeBackgroundColor({ color: BADGE_COLOR_OFF }),
    browser.action.setTitle({ title: `VLC shortcuts: ${stateLabel} - click to toggle` })
  ]);
}

async function syncToolbar() {
  await reflectEnabledState(await isEnabledItem.getValue());
}

export default defineBackground(async () => {
  browser.action.onClicked.addListener(async () => {
    await isEnabledItem.setValue(!(await isEnabledItem.getValue()));
  });

  isEnabledItem.watch(async isEnabled => {
    await reflectEnabledState(isEnabled);
  });
  browser.runtime.onInstalled.addListener(async () => {
    await syncToolbar();
  });
  browser.runtime.onStartup.addListener(async () => {
    await syncToolbar();
  });
  await syncToolbar();
});
