import { VDomModel, VDomRenderer } from '@jupyterlab/apputils';

import * as React from 'react';

import { MarkdownItManager } from './manager';
import { IMarkdownIt } from './tokens';

const SETTINGS_CLASS = 'jp-MarkdownItSettings';
const DOCS_CLASS = 'jp-MarkdownItSettings-Docs';
const EXAMPLES_CLASS = 'jp-MarkdownItSettings-Examples';

const ID_STEM = 'id-jp-mu-';

/**
 * A configuration/documentation UI for markdown-it plugins
 */
export class MarkdownItSettings extends VDomRenderer<MarkdownItSettings.Model> {
  constructor(model: MarkdownItSettings.Model) {
    super(model);
    this.addClass(SETTINGS_CLASS);
    this.addClass('jp-RenderedHTMLCommon');
  }

  dispose() {
    super.dispose();
    this.model.dispose();
  }

  /**
   * Render the settings form
   */
  protected render() {
    const m = this.model;
    const manager = m?.manager;
    if (manager == null) {
      return <div />;
    }

    const { providers } = m;

    return (
      <div>
        <header>
          <ul>
            <li>
              <a href={`#${ID_STEM}-global`}>Global</a>
            </li>
            <li>
              <a href={`#${ID_STEM}-plugins`}>Plugins</a>
              <ul>{providers.map(this.renderPluginNav, this)}</ul>
            </li>
          </ul>
        </header>
        <article>
          <section id={`${ID_STEM}-global`}>
            <h3>Global</h3>
            <label>
              <input
                type="checkbox"
                defaultChecked={m.enabled}
                onChange={this.onEnabledChanged}
              />
              Use <code>markdown-it</code>
            </label>
            <blockquote>
              Enable to use the <code>markdown-it</code> Markdown renderer and
              extensions for any new renderers.
            </blockquote>
          </section>
          <h3>Extensions</h3>
          {providers.map(this.renderPluginProvider, this)}
        </article>
      </div>
    );
  }

  /**
   * Render a single plugin provider nav link
   */
  protected renderPluginNav(provider: IMarkdownIt.IPluginProvider) {
    return (
      <li key={provider.id}>
        <a href={`#${ID_STEM}-plugin-${provider.id}`}>{provider.title}</a>
      </li>
    );
  }

  /**
   * Render a single plugin provider section
   */
  protected renderPluginProvider(provider: IMarkdownIt.IPluginProvider) {
    const m = this.model;

    const docs = [];
    const examples = [];

    for (const label in provider.documentationUrls) {
      docs.push(this.renderDoc(label, provider.documentationUrls[label]));
    }

    for (const label in provider.examples || {}) {
      examples.push(this.renderExample(label, provider.examples[label]));
    }

    return (
      <section key={provider.id} id={`${ID_STEM}-plugin-${provider.id}`}>
        <div>
          <h4 title={`plugin id: ${provider.id}`}>
            <label>
              <input
                type="checkbox"
                value={provider.id}
                defaultChecked={m.disabledPlugins.indexOf(provider.id) === -1}
                onChange={this.onPluginEnabledChanged}
              />
              {provider.title}
            </label>
          </h4>
          <ul className={DOCS_CLASS}>{docs}</ul>
        </div>
        <blockquote>{provider.description}</blockquote>
        <ul className={EXAMPLES_CLASS}>{examples}</ul>
      </section>
    );
  }

  protected renderDoc(label: string, url: string) {
    return (
      <li key={url}>
        <a href={url} target="_blank" rel="nofollow">
          {label}
        </a>
      </li>
    );
  }

  protected renderExample(label: string, code: string) {
    return (
      <div key={label}>
        <p>
          <label>{label}</label>
        </p>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  protected onPluginEnabledChanged = (
    evt: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { value, checked } = evt.currentTarget;
    this.model.setPluginEnabled(value, checked);
  };

  protected onEnabledChanged = (evt: React.ChangeEvent<HTMLInputElement>) => {
    this.model.enabled = evt.currentTarget.checked;
  };
}

export namespace MarkdownItSettings {
  /**
   * A model for managing markdown-it plugin settings
   */
  export class Model extends VDomModel {
    _manager: MarkdownItManager;
    _disabledPlugins: string[] = [];
    _enabled: boolean = true;
    _providers: IMarkdownIt.IPluginProvider[] = [];

    dispose() {
      super.dispose();
      if (this._manager) {
        this._manager.settingsChanged.disconnect(this.onSettingsChanged, this);
        this._manager = null;
      }
    }

    get manager() {
      return this._manager;
    }

    set manager(manager) {
      this._manager = manager;
      if (manager) {
        manager.settingsChanged.connect(this.onSettingsChanged, this);
        this.onSettingsChanged();
      }
    }

    get disabledPlugins() {
      return this._disabledPlugins;
    }

    get enabled() {
      return this._enabled;
    }

    set enabled(enabled) {
      this._manager.settings.set('enabled', enabled);
    }

    get providers() {
      return this._providers;
    }

    setPluginEnabled(id: string, enabled: boolean) {
      let disabledPlugins = this._disabledPlugins.slice();
      const idx = disabledPlugins.indexOf(id);
      if (enabled) {
        disabledPlugins.splice(idx);
      } else {
        disabledPlugins.push(id);
      }
      if (disabledPlugins.length) {
        this.manager.settings.set('disabled-plugins', disabledPlugins);
      } else {
        this.manager.settings.remove('disabled-plugins');
      }
    }

    onSettingsChanged() {
      const { composite } = this.manager.settings;

      if (composite != null) {
        this._disabledPlugins = (composite['disabled-plugins'] ||
          []) as string[];

        this._enabled = composite['enabled'] as boolean;
        this._providers = this.manager.pluginProviderIds.map(
          this.manager.getPluginProvider,
          this.manager
        );
        this._providers.sort(this.sortByTitle);
        console.log(this._providers);
      }

      this.stateChanged.emit(void 0);
    }

    sortByTitle(
      a: IMarkdownIt.IPluginProvider,
      b: IMarkdownIt.IPluginProvider
    ) {
      return a.title.localeCompare(b.title);
    }
  }
}
