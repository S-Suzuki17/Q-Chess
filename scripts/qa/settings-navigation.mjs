/** Exercise the same sections through the visible native picker or wide-screen tabs. */
export async function settingsSections(page){
 const picker=page.locator('[data-settings-section-picker]');
 if(await picker.isVisible())return picker.locator('option').evaluateAll(options=>options.map(option=>option.value));
 return page.getByRole('tab').evaluateAll(tabs=>tabs.map(tab=>tab.id.split('-tab-')[1]));
}
export async function chooseSettingsSection(page,value){
 const picker=page.locator('[data-settings-section-picker]');
 if(await picker.isVisible())await picker.selectOption(value);
 else await page.locator(`[role=tab][id$="-tab-${value}"]`).click();
}
