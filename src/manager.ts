import { IRenderMime, markdownRendererFactory } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { CodeMirrorEditor, Mode } from '@jupyterlab/codemirror';

import * as MarkdownIt from 'markdown-it';

import { RenderedMarkdown } from './widgets';
import { IMarkdownIt } from './tokens';

/**
 * A handle for the original createRenderer for restoring default behavior
 */
const ORIGINAL_RENDERER = markdownRendererFactory.createRenderer;

/**
 * An implementation of a source of markdown renderers with markdown-it and plugins
 */
export class MarkdownItManager implements IMarkdownIt {
  protected userDisabledPlugins: string[] = [];
  /**
   * Whether to use the markdown-it renderer: if installed, will use unless configured by user
   */
  protected useMarkdownIt = true;

  /**
   * MarkdownIt options configured by the user.
   */
  protected userMarkdownItOptions: object = {};

  /**
   * Per-plugin options configured by the user.
   */
  protected userPluginOptions: IMarkdownIt.IAllPluginOptions = {};

  /**
   * A handle on the settings for this plugin, which will be set... eventually
   */
  private _settings: ISettingRegistry.ISettings | null;

  /**
   * Providers labeled by an arbitrary key (usually the markdown-it package name)
   */
  private _pluginProviders: Map<
    string,
    IMarkdownIt.IPluginProvider
  > = new Map();

  constructor() {
    markdownRendererFactory.createRenderer = this.createRenderer;
  }

  /**
   * Create a new renderer, either with markdown-it or the original implementation
   */
  protected createRenderer = (options: IRenderMime.IRendererOptions) => {
    return this.useMarkdownIt
      ? new RenderedMarkdown(options)
      : ORIGINAL_RENDERER(options);
  };

  /**
   * Update the settings, and handle changes.
   */
  set settings(settings) {
    if (this._settings) {
      this._settings.changed.disconnect(this.onSettingsChanged, this);
    }
    this._settings = settings;
    if (settings != null) {
      this._settings.changed.connect(this.onSettingsChanged, this);
      this.onSettingsChanged();
    }
  }

  /**
   * The settings
   */
  get settings() {
    return this._settings;
  }

  /**
   * Update caches of settings values for new renderers
   */
  protected onSettingsChanged() {
    const useMarkdownIt = this.settings?.composite['enabled'] as boolean;
    this.useMarkdownIt = useMarkdownIt == null ? true : useMarkdownIt;

    this.userMarkdownItOptions =
      (this.settings?.composite['markdown-it-options'] as any) || {};

    this.userDisabledPlugins =
      (this.settings?.composite['disabled-plugins'] as string[]) || [];

    this.userPluginOptions =
      (this.settings?.composite[
        'plugin-options'
      ] as IMarkdownIt.IAllPluginOptions) || {};
  }

  /**
   * Add a provider for a plugin which can be resolved lazily
   */
  addPluginProvider(provider: IMarkdownIt.IPluginProvider): void {
    this._pluginProviders.set(provider.id, provider);
  }

  /**
   * Remove a provider by name
   */
  removePluginProvider(name: string) {
    this._pluginProviders.delete(name);
  }

  /**
   * Get a MarkdownIt instance
   */
  async getMarkdownIt(
    widget: RenderedMarkdown,
    options: MarkdownIt.Options = {}
  ): Promise<MarkdownIt> {
    const allOptions = {
      ...(await this.getOptions(widget)),
      ...options,
      ...this.userMarkdownItOptions,
    };

    let md = new MarkdownIt('default', allOptions);

    for (const [id, provider] of this._pluginProviders.entries()) {
      if (this.userDisabledPlugins.indexOf(id) !== -1) {
        continue;
      }
      try {
        const userOptions = this.userPluginOptions[id] || [];
        const [plugin, ...pluginOptions] = await provider.plugin();
        let i = 0;
        const maxOptions = Math.max(pluginOptions.length, userOptions.length);
        let compositeOptions = new Array(maxOptions);
        while (i < maxOptions) {
          compositeOptions[i] =
            userOptions.length < i ? userOptions[i] : pluginOptions[i];
          i++;
        }
        md = md.use(plugin, ...compositeOptions);
      } catch (err) {
        console.warn(`Failed to load/use markdown-it plugin ${id}`, err);
      }
    }

    return md;
  }

  /**
   * Combine core options with base options, plugin provider options, and user settings
   */
  async getOptions(widget: RenderedMarkdown) {
    let allOptions = this.baseMarkdownItOptions;

    for (const [id, plugin] of this._pluginProviders.entries()) {
      if (this.userDisabledPlugins.indexOf(id) !== -1) {
        continue;
      }

      if (plugin.options == null) {
        continue;
      }
      try {
        allOptions = { ...allOptions, ...(await plugin.options(widget)) };
      } catch (err) {
        console.warn(
          `Failed to get options from markdown-it plugin ${id}`,
          err
        );
      }
    }
    return allOptions;
  }

  /**
   * Default MarkdownIt options,
   *
   * NOTE: May be overridden by plugins
   */
  get baseMarkdownItOptions() {
    return {
      html: true,
      linkify: true,
      typographer: true,
      langPrefix: `cm-s-${CodeMirrorEditor.defaultConfig.theme} language-`,
      highlight: this.highlightCode,
    };
  }

  /**
   * Use CodeMirror to highlight code blocks,
   *
   * NOTE: May be overridden by plugins
   */
  highlightCode = (str: string, lang: string) => {
    if (!lang) {
      return ''; // use external default escaping
    }
    try {
      let spec = Mode.findBest(lang);
      if (!spec) {
        console.warn(`No CodeMirror mode: ${lang}`);
        return;
      }

      let el = document.createElement('div');
      try {
        Mode.run(str, spec.mime, el);
        return el.innerHTML;
      } catch (err) {
        console.warn(`Failed to highlight ${lang} code`, err);
      }
    } catch (err) {
      console.warn(`No CodeMirror mode: ${lang}`);
      console.warn(`Require CodeMirror mode error: ${err}`);
    }
    return '';
  };
}
