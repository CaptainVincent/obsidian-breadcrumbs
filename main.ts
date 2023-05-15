import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import Pickr from "@simonwep/pickr";

const clickEvent = new MouseEvent("click", {
	view: window,
	bubbles: true,
	cancelable: true,
});

function getFileTreeViewElement() {
	const leaves = this.app.workspace.getLeavesOfType("file-tree-view");
	if (leaves.length === 0) {
		return null;
	}
	return leaves[0].containerEl;
}

function getButton(query: string) {
	let pane = getFileTreeViewElement();
	if (pane) {
		return pane.querySelector(`div[data-path="${query}"] .oz-folder-block`);
	}
}

function click(target: HTMLElement, query: string) {
	const button = getButton(query);
	if (button) {
		target.classList.remove("fta-hidden");
		button.dispatchEvent(clickEvent);
		return true;
	}
	target.className = "fta-hidden";
	return false;
}

interface BreadcrumbsSettings {
	fontSizeFactor: number;
	fontColor: string;
	bgColor: string;
	separatorColor: string;
	separator: string;
	mode: string;
}

const DEFAULT_SETTINGS: BreadcrumbsSettings = {
	fontSizeFactor: 100,
	fontColor: "#757575",
	bgColor: "#1D2126",
	separatorColor: "#BFC6CE",
	separator: "/",
	mode: "default",
};

function createObservable(target: HTMLElement, query: string) {
	const observer = new MutationObserver((mutationsList, observer) => {
		if (click(target, query)) {
			observer.disconnect();
		}
	});
	return observer;
}
export default class Breadcrumbs extends Plugin {
	settings: BreadcrumbsSettings;
	observer: MutationObserver;
	postClick: string;
	editorStyle: Element;
	inner: Element;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BreadcrumbsSettingTab(this.app, this));
		this.refresh(true);
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.refresh(true))
		);
		this.registerEvent(
			this.app.vault.on("rename", (_) => {
				this.refresh(true);
			})
		);
	}

	onunload() {
		if (this.observer) this.observer.disconnect();
		this.refresh(false);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	extendTopOfEditor(on: boolean) {
		let height = "0px";
		if (on) {
			if (this.editorStyle === undefined) {
				this.editorStyle = document.createElement("style");
			}
			height = `${
				Math.floor((11 * this.settings.fontSizeFactor) / 100) + 16
			}px`;
		}
		this.editorStyle.innerHTML = `.cm-scroller.cm-vimMode { top: ${height}; }`;
		document.getElementsByTagName("head")[0].appendChild(this.editorStyle);
	}

	refresh(display: boolean) {
		if (this.inner) this.inner.remove();
		let mk: any = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (mk) {
			if (display) {
				this.extendTopOfEditor(true);
				this.inner = buildBreadcrumbs(
					this,
					app.vault.getName() +
						"/" +
						app.workspace.getActiveFile()?.path
				);
				mk.sourceMode.cmEditor.containerEl.appendChild(this.inner);
			} else {
				this.extendTopOfEditor(false);
			}
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function buildBreadcrumbs(plugin: Breadcrumbs, path: string) {
	const pathParts = path.split("/");
	const wrap = document.createElement("div");
	wrap.style.position = "fixed";
	wrap.style.top = "0";
	wrap.style.left = "0";
	wrap.style.fontSize =
		Math.floor((11 * plugin.settings.fontSizeFactor) / 100).toString() +
		"px";
	wrap.style.backgroundColor = plugin.settings.bgColor;
	wrap.style.padding = "8px";
	wrap.style.width = "100%";
	wrap.style.zIndex = "999";

	for (let i = 0; i < pathParts.length; i++) {
		const linkElement = document.createElement("a");
		linkElement.textContent = pathParts[i];
		linkElement.setAttribute("data-index", i.toString());
		linkElement.style.color = plugin.settings.fontColor;
		linkElement.addEventListener("click", (event) => {
			const index = parseInt(
				(event &&
					event.target &&
					(event.target as HTMLElement)?.getAttribute(
						"data-index"
					)) ||
					"0"
			);
			if (plugin.settings.mode === "default") {
				(app as any).commands.executeCommandById(
					"file-explorer:reveal-active-file"
				);
			} else {
				if (index === pathParts.length - 1) {
					(app as any).commands.executeCommandById(
						"file-tree-alternative:reveal-active-file"
					);
				} else {
					let query = "/";
					if (index > 0) {
						query = pathParts.slice(1, index + 1).join("/");
					}
					if (!getFileTreeViewElement()) {
						(app as any).commands.executeCommandById(
							"file-tree-alternative:open-file-tree-view"
						);
						if (
							this.observer &&
							this.observer.takeRecords().length !== 0
						) {
							this.observe.disconnect();
						}
						this.observer = createObservable(linkElement, query);
						this.observer.observe(this.app.workspace.containerEl, {
							childList: true,
							subtree: true,
						});
					} else {
						click(linkElement, query);
					}
				}
			}
		});
		wrap.appendChild(linkElement);
		if (i !== pathParts.length - 1) {
			const separator = document.createElement("span");
			let token =
				plugin.settings.separator !== ""
					? plugin.settings.separator
					: "/";
			separator.appendChild(document.createTextNode(` ${token} `));
			separator.style.color = plugin.settings.separatorColor;
			wrap.appendChild(separator);
		}
	}
	return wrap;
}

type NavigationMode = "default" | "alternative";

function getPickrSettings(opts: {
	isView: boolean;
	el: HTMLElement;
	containerEl: HTMLElement;
	swatches: string[];
	opacity: boolean | undefined;
	defaultColor: string;
}): Pickr.Options {
	const { el, isView, containerEl, swatches, opacity, defaultColor } = opts;

	return {
		el,
		container: isView ? document.body : containerEl,
		theme: "nano",
		swatches,
		lockOpacity: !opacity,
		default: defaultColor,
		position: "left-middle",
		components: {
			preview: true,
			hue: true,
			opacity: !!opacity,
			interaction: {
				hex: true,
				rgba: true,
				hsla: true,
				input: true,
				cancel: true,
				save: true,
			},
		},
	};
}

function onPickrCancel(instance: Pickr) {
	instance.hide();
}

class BreadcrumbsSettingTab extends PluginSettingTab {
	plugin: Breadcrumbs;
	pickr: Pickr;

	constructor(app: App, plugin: Breadcrumbs) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h3", { text: "Appearance" });

		const breadcrumbsfontSizeFactor = new Setting(containerEl)
			.setName("Font Size")
			.setDesc(
				`Base font size in percents. Current: ${this.plugin.settings.fontSizeFactor}%`
			);

		breadcrumbsfontSizeFactor.addSlider((slider) =>
			slider
				.setLimits(50, 200, 5)
				.setValue(this.plugin.settings.fontSizeFactor)
				.onChange(async (value) => {
					this.plugin.settings.fontSizeFactor = value;
					breadcrumbsfontSizeFactor.setDesc(
						`Base font size in percents. Current: ${this.plugin.settings.fontSizeFactor}%`
					);
					slider.setDynamicTooltip();
					await this.plugin.saveSettings();
					this.plugin.refresh();
				})
		);

		let isView: true;
		new Setting(containerEl)
			.setName("🎨 Set custom font color")
			.setDesc("Click on the picker to adjust the colour")
			.then((setting) => {
				this.pickr = Pickr.create(
					getPickrSettings({
						isView,
						el: setting.controlEl.createDiv({ cls: "picker" }),
						containerEl,
						swatches: [],
						opacity: true,
						defaultColor: this.plugin.settings.fontColor,
					})
				)
					.on(
						"save",
						async (color: Pickr.HSVaColor, instance: Pickr) => {
							if (!color) return;
							this.plugin.settings.fontColor = color
								.toHEXA()
								.toString();
							await this.plugin.saveSettings();
							this.plugin.refresh();
							instance.hide();
							instance.addSwatch(color.toHEXA().toString());
						}
					)
					.on("show", () => {
						const { result } = (this.pickr.getRoot() as any)
							.interaction;
						requestAnimationFrame(() =>
							requestAnimationFrame(() => result.select())
						);
					})
					.on("cancel", onPickrCancel);
			});

		new Setting(containerEl)
			.setName("🎨 Set custom separator color")
			.setDesc("Click on the picker to adjust the colour")
			.then((setting) => {
				this.pickr = Pickr.create(
					getPickrSettings({
						isView,
						el: setting.controlEl.createDiv({ cls: "picker" }),
						containerEl,
						swatches: [],
						opacity: true,
						defaultColor: this.plugin.settings.separatorColor,
					})
				)
					.on(
						"save",
						async (color: Pickr.HSVaColor, instance: Pickr) => {
							if (!color) return;
							this.plugin.settings.separatorColor = color
								.toHEXA()
								.toString();
							await this.plugin.saveSettings();
							this.plugin.refresh();
							instance.hide();
							instance.addSwatch(color.toHEXA().toString());
						}
					)
					.on("show", () => {
						const { result } = (this.pickr.getRoot() as any)
							.interaction;
						requestAnimationFrame(() =>
							requestAnimationFrame(() => result.select())
						);
					})
					.on("cancel", onPickrCancel);
			});

		new Setting(containerEl)
			.setName("🖌️ Set custom separator")
			.setDesc("Symbol between every folders and file")
			.addText((text) =>
				text
					.setPlaceholder("/")
					.setValue(this.plugin.settings.separator)
					.onChange(async (value) => {
						this.plugin.settings.separator = value;
						await this.plugin.saveSettings();
						this.plugin.refresh();
					})
			);

		new Setting(containerEl)
			.setName("🎨 Set custom background color")
			.setDesc("Click on the picker to adjust the colour")
			.then((setting) => {
				this.pickr = Pickr.create(
					getPickrSettings({
						isView,
						el: setting.controlEl.createDiv({ cls: "picker" }),
						containerEl,
						swatches: [],
						opacity: true,
						defaultColor: this.plugin.settings.bgColor,
					})
				)
					.on(
						"save",
						async (color: Pickr.HSVaColor, instance: Pickr) => {
							if (!color) return;
							this.plugin.settings.bgColor = color
								.toHEXA()
								.toString();
							await this.plugin.saveSettings();
							this.plugin.refresh();
							instance.hide();
							instance.addSwatch(color.toHEXA().toString());
						}
					)
					.on("show", () => {
						const { result } = (this.pickr.getRoot() as any)
							.interaction;
						requestAnimationFrame(() =>
							requestAnimationFrame(() => result.select())
						);
					})
					.on("cancel", onPickrCancel);
			});

		new Setting(containerEl)
			.setName("Browse Breadcrumbs")
			.setDesc(
				"Choose which mode you want to use for navigation from breadcrumbs"
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("default", "Default")
					.addOption("alternative", "File Tree Alternative")
					.setValue(this.plugin.settings.mode)
					.onChange((value: NavigationMode) => {
						this.plugin.settings.mode = value;
						this.plugin.saveSettings();
						this.plugin.refresh();
					});
			});
	}
}
