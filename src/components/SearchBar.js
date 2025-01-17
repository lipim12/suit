// @flow
import React from 'react';
import PropTypes from 'prop-types';
import { withRouter } from 'react-router-dom';

import Dropdown from 'react-bootstrap/lib/Dropdown';
import Glyphicon from 'react-bootstrap/lib/Glyphicon';
import MenuItem from 'react-bootstrap/lib/MenuItem';

import Configurable from './Configurable';
import AutoCompleteInput from './AutoCompleteInput';
import ShareSearch from './ShareSearch';
import SignalData from '../api/SignalData';
import AuthUtils from '../util/AuthUtils';
import Signals from '../api/Signals';

declare var webkitSpeechRecognition: any; // Prevent complaints about this not existing

type SearchBarProps = {
  history: PropTypes.object.isRequired,
  /** If set, this will be styled to live inside a Masthead component. */
  inMasthead?: boolean,
  /**
   * The placeholder text to display when the input field is empty and Simple
   * Query Language is selected. Defaults to “Search…”
   */
  placeholder: string,
  /**
   * The placeholder text to display when the input field is empty and Advanced
   * Query Language is selected. Defaults to “Enter an advanced query…”
   */
  placeholderAdvanced: string,
  /**
   * Whether to show a toggle for simple/advanced language in the search bar.
   * Defaults to true.
   */
  allowLanguageSelect: boolean,
  /**
   * If set, the microphone button is displayed in the search field and the
   * user can use speech recognition to input the query terms. This functionality
   * is only available if the user’s browser is Chrome.
   */
  allowVoice: boolean,
  /**
   * If set, the search bar’s input field will use autocomplete via this URI.
   * Otherwise, if the configuration is available, the autoCompleteUri in the
   * configuration will be used.
   * Otherwise, the search bar will not autocomplete.
   * Note that this is relative to the baseUri field in the configuration.
   */
  autoCompleteUri: string,
  /**
   * Optional. The location of the node through which to interact with Attivio.
   * Defaults to the value in the configuration.
   */
  baseUri: string,
  /** The label to show on the search button. Defaults to "Go". */
  buttonLabel: string,
  /** If set, this is the route to navigate to upon executing a search. By default, no navigation will occur when searching. */
  route: string | null,
  /** Specifies if share search option should be displayed or not, false by default */
  allowShareSearch?: boolean,
  /**
   * If set, a new signal of this type would be added when an autocomplete item is selected.
   */
  createAutoCompleteSignal?: boolean,
  /**
   * The message body for when a search is shared.
   */
  shareMessage?: string,
  /**
   * Subject of the email for when a search is shared.
   */
  subject?: string,
  /**
   * Email address the search will be shared with when using shareSearch.
   */
  email?: string,
};

type SearchBarDefaultProps = {
  inMasthead: boolean,
  placeholder: string,
  placeholderAdvanced: string,
  allowLanguageSelect: boolean,
  allowVoice: boolean,
  buttonLabel: string,
  autoCompleteUri: string | null,
  route: string | null,
  baseUri: string,
  allowShareSearch: boolean,
  createAutoCompleteSignal: boolean,
  shareMessage: string,
  subject: string,
  email: string,
};

type SearchBarState = {
  recognizing: boolean,
  suggestions: Array<string>,
};

/**
 * Component to include in the Masthead for entering the query
 * to use when searching. Must be inside a Searcher component.
 */
class SearchBar extends React.Component<SearchBarDefaultProps, SearchBarProps, SearchBarState> {
  static defaultProps: SearchBarDefaultProps = {
    inMasthead: false,
    placeholder: 'Search\u2026',
    placeholderAdvanced: 'Enter an advanced query\u2026',
    buttonLabel: 'Go',
    allowLanguageSelect: true,
    allowVoice: false,
    autoCompleteUri: null,
    route: null,
    baseUri: '',
    allowShareSearch: false,
    createAutoCompleteSignal: false,
    shareMessage: `Hey,
    
    I think you would be interested in these search results that I found using Attivio, a leader in cognitive search and knowledge discovery. Here is the link:`,
    subject: 'Search results I found using Attivio!',
    email: '',
  };

  static contextTypes = {
    searcher: PropTypes.any,
  };

  static displayName = 'SearchBar';

  static AUTOCOMPLETE_THRESHOLD = 2;

  constructor(props: SearchBarProps) {
    super(props);
    this.state = {
      query: '',
      recognizing: false,
      suggestions: [],
    };
    (this: any).doKeyPress = this.doKeyPress.bind(this);
    (this: any).doSearch = this.doSearch.bind(this);
    (this: any).startSpeechRecognition = this.startSpeechRecognition.bind(this);
    (this: any).queryChanged = this.queryChanged.bind(this);
    (this: any).updateQuery = this.updateQuery.bind(this);
    (this: any).languageChanged = this.languageChanged.bind(this);
    (this: any).renderInputComponent = this.renderInputComponent.bind(this);
    (this: any).addSignal = this.addSignal.bind(this);
    if (this.props.allowVoice && !('webkitSpeechRecognition' in window)) {
      console.log('Requested speech recognition but the browser doesn’t support it'); // eslint-disable-line no-console
    }
  }

  state: SearchBarState;

  getSuggestionList() {
    if (!this.state.suggestions || this.state.suggestions.length === 0) {
      return null;
    }
    const contents = this.state.suggestions.map((suggestion) => {
      return <MenuItem key={suggestion}>{suggestion}</MenuItem>;
    });
    return (
      <ul className="list-unstyled" role="menu">
        {contents}
      </ul>
    );
  }

  submitButton: ?HTMLButtonElement;

  startSpeechRecognition() {
    const recognition = new webkitSpeechRecognition(); // eslint-disable-line new-cap,no-undef
    recognition.continuous = true;
    recognition.interrimResults = true;
    // recognition.lang = 'en';

    recognition.onresult = (e: any) => {
      recognition.stop();
      const newQuery = e.results[0][0].transcript;
      if (e.results[0].isFinal) {
        const searcher = this.context.searcher;
        if (searcher) {
          searcher.setQueryAndSearch(newQuery);
        }
      }
      this.setState({
        recognizing: false,
      });
    };

    recognition.onerror = () => {
      recognition.stop();
      this.setState({
        recognizing: false,
      });
    };

    recognition.start();
    this.setState({
      recognizing: true,
    });
  }

  languageChanged(newLanguage: 'simple' | 'advanced') {
    const searcher = this.context.searcher;
    if (searcher && newLanguage) {
      searcher.updateQueryLanguage(newLanguage);
    }
  }

  addSignal(query: string, signalData: SignalData) {
    const signalType = this.props.createAutoCompleteSignal;
    const savedUser = AuthUtils.getSavedUser();
    if (!signalType || !savedUser) {
      return;
    }
    const signal = signalData.clone();
    signal.docId = query;
    signal.featureVector = '';
    signal.locale = 'en';
    signal.principal = `${AuthUtils.config.ALL.defaultRealm}:${savedUser.fullName}:${savedUser.userId}`;
    signal.relevancyModelName = 'default';
    signal.relevancyModelNames = ['default'];
    signal.relevancyModelVersion = 1;
    signal.signalTimestamp = Date.now();
    signal.type = 'autocomplete';
    signal.weight = 1;

    new Signals(this.props.baseUri).addRawSignal(signal);
  }

  updateQuery(newQuery: string, doSearch: boolean = false, signalData?: SignalData) {
    // Update the searcher
    const searcher = this.context.searcher;
    if (signalData) {
      this.addSignal(newQuery, signalData);
    }
    if (searcher) {
      if (doSearch) {
        if (!searcher.state.haveSearched) {
          // on click of Enter, if a new query is being searched
          // reset filters & display results
          searcher.setQueryAndSearch(newQuery);
          this.route();
        } else {
          // do not reset only search
          searcher.doSearch();
        }
      } else {
        searcher.updateQuery(newQuery);
      }
    }
    this.forceUpdate();
  }

  queryChanged(e: Event) {
    if (e.target instanceof HTMLInputElement) {
      const newQuery = e.target.value;
      this.updateQuery(newQuery);
    }
  }

  advancedMenuItem: ?HTMLSpanElement;
  simpleMenuItem: ?HTMLSpanElement;

  route() {
    const searcher = this.context.searcher;
    if (this.props.route && searcher) {
      // We need to do this to ensure the Searcher's state survives the navigation
      const searchString = searcher.generateLocationQueryStringFromState(searcher.state);
      this.props.history.push({
        pathname: this.props.route,
        search: searchString,
      });
    }
  }

  doSearch() {
    const searcher = this.context.searcher;
    if (this.props.route && searcher) {
      this.route();
    } else if (searcher.state.query && !searcher.state.haveSearched) {
      // on click of Go, if a new query is being searched
      // reset filters & display results
      searcher.setQueryAndSearch(searcher.state.query);
    } else if (searcher.state.query && searcher.state.haveSearched) {
      // do not reset only search
      searcher.doSearch();
    }
    if (this.submitButton) {
      this.submitButton.blur();
    }
  }

  doKeyPress(e: Event) {
    // If the user presses enter, do the search
    if (e.target instanceof HTMLInputElement) {
      if (e.keyCode === 13) {
        this.doSearch();
      }
    }
  }

  renderInputComponent(query, language) {
    const {
      placeholder: defaultPlaceholder = '',
      placeholderAdvanced = '',
      allowLanguageSelect,
      inMasthead,
      autoCompleteUri,
      baseUri,
    } = this.props;
    const placeholder = allowLanguageSelect && language === 'advanced'
      ? placeholderAdvanced
      : defaultPlaceholder;
    const inputClass = inMasthead ? 'form-control attivio-globalmast-search-input' : 'form-control';
    return autoCompleteUri ? (
      <AutoCompleteInput
        uri={`${baseUri}${autoCompleteUri}`}
        updateValue={this.updateQuery}
        placeholder={placeholder || ''}
        value={query}
        className={inputClass}
      />
    ) : (
      <input
        type="search"
        className={inputClass}
        placeholder={placeholder}
        onChange={this.queryChanged}
        onKeyDown={this.doKeyPress}
        value={query}
      />
    );
  }

  render() {
    const showMicrophone = this.props.allowVoice && 'webkitSpeechRecognition' in window;
    const micStyle = {};
    if (this.state.recognizing) {
      micStyle.backgroundSize = '125%';
    }

    const containerClass = this.props.inMasthead ? 'attivio-globalmast-search-container' : '';
    const subContainerClass = this.props.allowShareSearch ? 'attivio-globalmast-search-share-search' : 'attivio-globalmast-search';

    let query = '';
    let language = 'simple';
    const searcher = this.context.searcher;

    if (searcher) {
      query = searcher.state.query;
      language = searcher.state.queryLanguage;
    }

    const suggestionList = this.getSuggestionList();
    const simpleMenuItem = (
      <MenuItem
        onSelect={() => {
          this.languageChanged('simple');
          if (this.simpleMenuItem) {
            this.simpleMenuItem.blur();
          }
        }}
      >
        <span
          ref={(c) => {
            this.simpleMenuItem = c;
          }}
        >
          <span style={{ visibility: language === 'simple' ? 'visible' : 'hidden' }}>&#x2713;</span> Simple
        </span>
      </MenuItem>
    );
    const advancedMenuItem = (
      <MenuItem
        onSelect={() => {
          this.languageChanged('advanced');
          if (this.advancedMenuItem) {
            this.advancedMenuItem.blur();
          }
        }}
      >
        <span
          ref={(c) => {
            this.advancedMenuItem = c;
          }}
        >
          <span
            style={{
              visibility: language === 'advanced' ? 'visible' : 'hidden',
            }}
          >
            &#x2713;
          </span>{' '}
          Advanced
        </span>
      </MenuItem>
    );

    const languageControl = this.props.allowLanguageSelect ? (
      <Dropdown
        id="myDropdown"
        className=""
        onSelect={this.languageChanged}
        componentClass="div"
        style={{ display: 'inline-block' }}
      >
        <Dropdown.Toggle
          noCaret
          useAnchor
          className="attivio-smalltoolbar-btn"
          bsClass="attivio-smalltoolbar-btn"
          title="Query Language"
          style={{
            position: 'relative',
            top: '1px',
            left: '-2px',
            color: '#fff',
            border: 'none',
            background: 'transparent',
          }}
        >
          <Glyphicon glyph="search" style={{ color: 'white' }} />
          {' '}
          <span className="attivio-globalmast-icon attivio-icon-arrow-down-blue" />
        </Dropdown.Toggle>
        <Dropdown.Menu
          style={{
            paddingTop: 0,
            paddingBottom: 0,
          }}
        >
          {simpleMenuItem}
          {advancedMenuItem}
        </Dropdown.Menu>
      </Dropdown>
    ) : (
      ''
    );

    const {
      subject = '',
      email: emailAddress = '',
      shareMessage,
    } = this.props;

    return (
      <div className={containerClass}>
        <div className={subContainerClass} role="search">
          <div className="form-group">
            {this.renderInputComponent(query, language)}
            {showMicrophone ? (
              <a onClick={this.startSpeechRecognition} role="button" tabIndex={0}>
                <span className="attivio-globalmast-search-mic-icon attivio-icon-microphone" style={micStyle} />
              </a>
            ) : ''}
            <button
              type="submit"
              className="btn attivio-globalmast-search-submit"
              onClick={this.doSearch}
              ref={(c) => {
                this.submitButton = c;
              }}
            >
              {this.props.buttonLabel}
            </button>
          </div>
          {suggestionList}
        </div>
        {languageControl}
        {this.props.allowShareSearch &&
        <ShareSearch shareMessage={shareMessage} subject={subject} email={emailAddress} />}
      </div>
    );
  }
}

export default withRouter(Configurable(SearchBar));
