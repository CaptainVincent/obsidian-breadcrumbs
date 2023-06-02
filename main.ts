import {
	App,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
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

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BreadcrumbsSettingTab(this.app, this));
		this.refresh_all();
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.refresh_active())
		);
		this.registerEvent(
			this.app.vault.on("rename", () => this.refresh_all())
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () =>
				this.refresh_all()
			)
		);
	}

	onunload() {
		if (this.observer) this.observer.disconnect();
		app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.getViewState().type === "markdown") {
				let target = leaf.view.containerEl;
				target.removeAttribute("bcpath");
				target.querySelectorAll("#breadcrumbs").forEach((element) => {
					element.remove();
				});
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	buildBreadcrumbs(path: string) {
		const pathParts = path.split("/");
		const wrap = document.createElement("div");
		wrap.id = "breadcrumbs";
		wrap.style.position = "relative";
		wrap.style.fontSize =
			Math.floor((11 * this.settings.fontSizeFactor) / 100).toString() +
			"px";
		wrap.style.backgroundColor = this.settings.bgColor;
		wrap.style.padding = "8px";
		wrap.style.width = "100%";
		wrap.style.zIndex = "999";

		for (let i = 0; i < pathParts.length; i++) {
			const linkElement = document.createElement("a");
			linkElement.textContent = pathParts[i];
			linkElement.setAttribute("data-index", i.toString());
			linkElement.style.color = this.settings.fontColor;
			linkElement.addEventListener("click", (event) => {
				const index = parseInt(
					(event &&
						event.target &&
						(event.target as HTMLElement)?.getAttribute(
							"data-index"
						)) ||
						"0"
				);
				if (this.settings.mode === "default") {
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
						(app as any).commands.executeCommandById(
							"file-tree-alternative:reveal-active-file"
						);
						if (!getFileTreeViewElement()) {
							// explorer plugin didn't preopened
							if (
								this.observer &&
								this.observer.takeRecords().length !== 0
							) {
								this.observer.disconnect();
							}
							this.observer = createObservable(
								linkElement,
								query
							);
							this.observer.observe(
								this.app.workspace.containerEl,
								{
									childList: true,
									subtree: true,
								}
							);
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
					this.settings.separator !== ""
						? this.settings.separator
						: "/";
				separator.appendChild(document.createTextNode(` ${token} `));
				separator.style.color = this.settings.separatorColor;
				wrap.appendChild(separator);
			}
		}
		return wrap;
	}

	build_single(leaf: WorkspaceLeaf, force = false) {
		let fullPath =
			this.app.vault.getName() + "/" + leaf.getViewState().state.file;
		let target = leaf.view.containerEl;
		if (target.getAttribute("bcpath") !== fullPath || force == true) {
			target.querySelectorAll("#breadcrumbs").forEach((element) => {
				element.remove();
			});
			const sourceElement = leaf.view.containerEl.querySelector(
				".markdown-source-view"
			);
			sourceElement?.prepend(this.buildBreadcrumbs(fullPath));
			target.setAttribute("bcpath", fullPath);
		}
	}

	refresh_active() {
		let active_leaf = app.workspace.getActiveViewOfType(MarkdownView);
		if (active_leaf) {
			this.build_single(active_leaf.leaf);
		}
	}

	refresh_all(force = false) {
		app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.getViewState().type === "markdown") {
				this.build_single(leaf, force);
			}
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
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
					this.plugin.refresh_all(true);
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
							this.plugin.refresh_all(true);
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
							this.plugin.refresh_all(true);
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
						this.plugin.refresh_all(true);
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
							this.plugin.refresh_all(true);
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
						this.plugin.refresh_all(true);
					});
			});
	}
}
