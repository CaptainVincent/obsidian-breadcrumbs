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
import { WidgetType } from "@codemirror/view";
import { Extension } from "@codemirror/state";
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

export default class Breadcrumbs extends Plugin {
	settings: BreadcrumbsSettings;
	editorExtension: Extension[];
	forcerRfresh: boolean;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new BreadcrumbsSettingTab(this.app, this));

		this.loadExtension();
	}

	onunload() {}

	loadExtension() {
		this.editorExtension = [getViewPlugin(this)];
		this.registerEditorExtension(this.editorExtension);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	public async refresh() {
		this.forcerRfresh = true;
		const updatedExt = getViewPlugin(this);
		this.editorExtension[0] = updatedExt;
		this.app.workspace.updateOptions();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class BreadcrumbsWidget extends WidgetType {
	readonly pathParts: string[];
	constructor(readonly plugin: Breadcrumbs, readonly path: string) {
		super();
		this.plugin = plugin;
		this.path = path;
		this.pathParts = this.path.split("/");
	}

	eq(other: BreadcrumbsWidget) {
		return other.path === this.path && !this.plugin.forcerRfresh;
	}

	toDOM() {
		this.plugin.forcerRfresh = false;
		const wrap = document.createElement("div");
		wrap.style.position = "fixed";
		wrap.style.top = "0";
		wrap.style.left = "0";
		wrap.style.fontSize =
			Math.floor(
				(11 * this.plugin.settings.fontSizeFactor) / 100
			).toString() + "px";
		wrap.style.backgroundColor = this.plugin.settings.bgColor;
		wrap.style.padding = "8px";
		wrap.style.width = "100%";
		wrap.style.zIndex = "999";

		for (let i = 0; i < this.pathParts.length; i++) {
			const pathPart = this.pathParts[i];
			const linkElement = document.createElement("a");
			linkElement.textContent = pathPart;
			linkElement.setAttribute("data-index", i.toString());
			linkElement.style.color = this.plugin.settings.fontColor;
			linkElement.addEventListener("click", (event) => {
				const index =
					event &&
					event.target &&
					(event.target as HTMLElement)?.getAttribute("data-index");
				console.log(this.path, index);
				if (this.plugin.settings.mode === "default") {
					(app as any).commands.executeCommandById(
						"file-explorer:reveal-active-file"
					);
				} else {
					(app as any).commands.executeCommandById(
						"file-tree-alternative:reveal-active-file"
					);
				}
			});
			wrap.appendChild(linkElement);
			if (i !== this.pathParts.length - 1) {
				const separator = document.createElement("span");
				let token =
					this.plugin.settings.separator !== ""
						? this.plugin.settings.separator
						: "/";
				separator.appendChild(document.createTextNode(` ${token} `));
				separator.style.color = this.plugin.settings.separatorColor;
				wrap.appendChild(separator);
			}
		}
		return wrap;
	}

	ignoreEvent() {
		return false;
	}
}

import {
	ViewUpdate,
	ViewPlugin,
	DecorationSet,
	Decoration,
	EditorView,
} from "@codemirror/view";

const getViewPlugin = (plugin: Breadcrumbs) =>
	ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.decorate();
			}

			decorate(): DecorationSet {
				let path = app.workspace.getActiveFile()?.path ?? null;
				const widgets: Decoration[] = [];
				if (path != null) {
					widgets.push(
						Decoration.widget({
							widget: new BreadcrumbsWidget(
								plugin,
								app.vault.getName() + "/" + path
							),
						})
					);
				}
				return Decoration.set(
					widgets.map((w) => w.range(0)),
					true
				);
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);

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
