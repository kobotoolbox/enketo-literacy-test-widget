import Widget from 'enketo-core/src/js/widget';
import $ from 'jquery';
const FLASH = 'flash';
const STOP = 'stop';
const START = 'start';
const FINISH = 'finish';

/**
 * Conduct Literacy Tests as part of an Enketo Form
 *
 */
class LiteracyWidget extends Widget {

    static get selector() {
        return '.or-appearance-literacy.simple-select';
    }

    static get helpersRequired() {
        return [ 'evaluate' ];
    }

    get props() {
        const props = this._props;
        const i = this.element.querySelector( 'input[type="checkbox"]' );
        const words = this.element.querySelectorAll( '.option-wrapper label' );

        props.flashTime = !isNaN( this.element.dataset.flash ) ? Number( this.element.dataset.flash ) : 60;
        props.name = i.name;
        props.numberWords = words.length;
        props.relevant = i.dataset.relevant || '';
        props.constraint = i.dataset.constraint || '';
        props.required = i.dataset.required || '';

        return props;
    }

}


// TODO: move these methods inside the class statement.
// TODO: make this widget compliant with the new Enketo Core widget format and run the common tests.

LiteracyWidget.prototype._init = function() {
    const that = this;
    const $startButton = $( '<button class="btn btn-default literacy-widget__start" type="button">Start</button>' );
    const $stopButton = $( '<button class="btn btn-primary literacy-widget__stop" disabled type="button">Finish</button>' );
    const $resetButton = $( '<button class="btn-icon-only btn-reset" type="button"><i class="icon icon-refresh"> </i></button></div>' );
    const $timer = $( '<div class="literacy-widget__timer"/>' );
    const $report = $( '<div class="literacy-widget__report">' );
    let existingValue;

    if ( !this.element.querySelector( 'input[type="checkbox"]' ) || this.element.querySelector( 'input[type="checkbox"][readonly]' ) ) {
        console.log( 'not istan' );

        return;
    }
    console.log( 'instantiating', this.name );
    // It is highly unusual to obtain the value from the model like this, but the form engine has attempted 
    // to load the model value in the checkboxes and failed with the first 10 items in the space-separated list.
    // For loading, a regular text input would have been better, but we would not have had the benefit of a almost
    // complete DOM with all the words. So it's a compromise.
    existingValue = this._getCurrentModelValue();

    // Create a hidden replacement input to will serve as the 'original'. 
    // This is a very unusual approach as usually we leave the original intact.
    this.$input = $( `<input type="text" name="${this.props.name}" ${this.props.readonly ? 'readonly' : ''}${[ 'required', 'constraint', 'relevant' ].map( item => that.props[ item ] ? `data-${item}="${that.props[ item ]}" ` : '' ).join( '' )}/>` );
    this.$checkboxes = $( this.element )
        .find( 'input[type="checkbox"]' )
        .addClass( 'ignore' )
        .removeAttr( 'name data-type-xml data-relevant data-required' )
        .prop( 'disabled', true );

    $( this.element )
        .find( '.option-wrapper' )
        .addClass( 'widget literacy-widget' )
        .after( this.$input )
        .prepend( $startButton )
        .prepend( $timer )
        .append( $stopButton )
        .append( $report )
        .append( $resetButton );

    this._addResetHandler( $resetButton );
    this._addTimerHandlers( $startButton, $stopButton );
    this._addWordHandlers();

    if ( existingValue ) {
        this.$input.val( existingValue );
        this._loadValues( this._convertSpaceList( existingValue ) );
        this._setState( FINISH );
    }
};

LiteracyWidget.prototype._getCurrentModelValue = function() {
    const context = this.props.name.split( '/' ).length > 3 ? this.props.name.substring( 0, this.props.name.lastIndexOf( '/' ) ) : null;
    const closestRepeat = this.element.closest( '.or-repeat[name]' );
    const index = closestRepeat ? [ ...this.element.closest( 'form.or' ).querySelectorAll( `.or-repeat[name="${closestRepeat.getAttribute( 'name' )}"]` ) ].indexOf( closestRepeat ) : 0;
    return this.options.helpers.evaluate( this.props.name, 'string', context, index );
};


LiteracyWidget.prototype._addResetHandler = function( $resetButton ) {
    const that = this;

    $resetButton.on( 'click', () => {
        if ( that.timer && that.timer.interval ) {
            clearInterval( that.timer.interval );
        }
        that.timer = {
            elapsed: 0,
            element: that.element.querySelector( '.literacy-widget__timer' ),
            interval: null,
            state: null
        };
        that.result = {
            flashWordIndex: null,
            lastWordIndex: null
        };
        that.$input.val( '' ).trigger( 'change' );
        $( that.element ).find( '.literacy-widget__report' ).empty();
        that._resetCheckboxes();
        that._resetWords();
        that._updateTimer();
        that._setState( null );
    } ).click();
};

LiteracyWidget.prototype._addTimerHandlers = function( $startButton, $stopButton ) {
    const that = this;
    this._updateTimer();

    $startButton.on( 'click', () => {
        that.timer.interval = setInterval( that._tick.bind( that ), 1000 );
        that._setState( START );
        $stopButton.prop( 'disabled', false );
    } );

    $stopButton.on( 'click', () => {
        clearInterval( that.timer.interval );
        that._setState( STOP );
        $stopButton.prop( 'disabled', true );
    } );
};

/**
 * Handlers for clicking words and checkboxes.
 * The state determines whether these handlers actually perform any action!
 */
LiteracyWidget.prototype._addWordHandlers = function() {
    const that = this;

    // TODO: if we only allow one type of click at a time, we should remove this
    $( this.element ).on( 'click', evt => {
        const target = evt.target;
        // only register clicks on checkbox itself, not on label
        if ( target.nodeName.toLowerCase() === 'input' ) {
            return true;
        } else {
            return false;
        }
    } );

    $( this.element ).find( '.option-label' ).on( 'click', function() {
        if ( [ START, STOP, FLASH ].indexOf( that.timer.state ) !== -1 ) {
            $( this ).closest( 'label' ).toggleClass( 'incorrect-word' );
        }
    } );

    $( this.element ).on( `change.${this.namespace}`, 'input[type="checkbox"]', function() {
        if ( this.checked && that.timer.state === FLASH ) {
            that.result.flashWordIndex = that._getCheckboxIndex( this );
            that._setState( START );
        } else if ( this.checked && that.timer.state === STOP ) {
            let values;
            that.result.lastWordIndex = that._getCheckboxIndex( this );
            values = that._getValues();
            that.$input.val( values.xmlValue ).trigger( 'change' );
            that._setState( FINISH );
        }
    } );
};

LiteracyWidget.prototype._resetWords = function() {
    $( this.element )
        .find( '.incorrect-word, .at-flash, .at-end, .unread' ).removeClass( 'incorrect-word at-flash at-end unread' );
};

LiteracyWidget.prototype._hideCheckboxes = function() {
    this.$checkboxes.prop( 'disabled', true );
};

LiteracyWidget.prototype._getCheckboxIndex = function( input ) {
    return this.$checkboxes.index( input );
};

LiteracyWidget.prototype._showCheckboxes = function( startIndex ) {
    startIndex = startIndex || 0;
    this.$checkboxes.slice( startIndex ).prop( 'disabled', false );
};

LiteracyWidget.prototype._resetCheckboxes = function() {
    this.$checkboxes.prop( 'checked', false );
};

/* 
 * Sets the state variable and sets the UI state by showing/hiding/styling things.
 * 
 * Note, I had some trouble properly separating state from actions, so there
 * is opportunity to improve this, by moving things from button handlers to this function or 
 * the other way around.
 */
LiteracyWidget.prototype._setState = function( state ) {
    let lastIncorrectIndex;
    this.element.classList.remove( START, STOP, FLASH, FINISH );
    this.timer.state = state;
    if ( state ) {
        this.element.classList.add( state );
    }
    switch ( state ) {
        case START:
            this._updateWordCounts();
            this._hideCheckboxes();
            break;
        case STOP:
            lastIncorrectIndex = this._getCheckboxIndex( $( this.element ).find( '.incorrect-word input[type="checkbox"]' ).last()[ 0 ] );
            this._showCheckboxes( ( this.result.flashWordIndex >= lastIncorrectIndex ? this.result.flashWordIndex : lastIncorrectIndex ) );
            break;
        case FLASH:
            lastIncorrectIndex = this._getCheckboxIndex( $( this.element ).find( '.incorrect-word input[type="checkbox"]' ).last()[ 0 ] );
            this._showCheckboxes( lastIncorrectIndex || 0 );
            break;
        case FINISH:
            this._updateWordCounts();
            this._hideCheckboxes();
            break;
        default:
            this._hideCheckboxes();
    }
};

LiteracyWidget.prototype._updateTimer = function() {
    this.timer.element.textContent = this._formatTime( this.timer.elapsed );
};

LiteracyWidget.prototype._updateWordCounts = function() {
    if ( this.result.flashWordIndex !== null ) {
        this.$checkboxes.eq( this.result.flashWordIndex ).parent().addClass( 'at-flash' );
    }
    if ( this.result.lastWordIndex !== null ) {
        this.$checkboxes.eq( this.result.lastWordIndex ).parent().addClass( 'at-end' )
            .nextAll( 'label' ).addClass( 'unread' );
    }
};

LiteracyWidget.prototype._formatTime = time => {
    const hrs = ~~( time / 3600 );
    const mins = ~~( ( time % 3600 ) / 60 );
    const secs = time % 60;
    let formattedTime = '';
    if ( hrs > 0 ) {
        formattedTime += `${hrs}:${mins < 10 ? '0' : ''}`;
    }
    formattedTime += `${mins}:${secs < 10 ? '0' : ''}`;
    formattedTime += `${secs}`;
    return formattedTime;
};

LiteracyWidget.prototype._tick = function() {
    this.timer.elapsed++;
    this._updateTimer();
    if ( this.timer.elapsed === this.props.flashTime ) {
        this._setState( FLASH );
    }
};

LiteracyWidget.prototype._getValues = function() {
    const finishCount = this.result.lastWordIndex !== null ? this.result.lastWordIndex + 1 : null;
    const flashCount = this.result.flashWordIndex !== null ? this.result.flashWordIndex + 1 : null;
    const incorrectWords = $( this.element ).find( '.incorrect-word input' ).map( function() {
        return this.value;
    } ).get();

    return {
        flashCount,
        finishCount,
        finishTime: this.timer.elapsed,
        incorrectWords,
        xmlValue: [ flashCount, this.timer.elapsed, finishCount, null, null, null, null, null, null, null ]
            .map( item => {
                if ( item === null || typeof item === 'undefined' ) {
                    return 'null';
                }
                return item;
            } )
            .concat( incorrectWords ).join( ' ' )
    };
};

LiteracyWidget.prototype._loadValues = function( values ) {
    const $labels = this.$checkboxes.parent( 'label' );
    this.timer.elapsed = values.finishTime;
    this.result.lastWordIndex = values.finishCount !== null ? values.finishCount - 1 : null;
    this.result.flashWordIndex = values.flashCount !== null ? values.flashCount - 1 : null;

    this._updateTimer();
    this._updateWordCounts();

    values.incorrectWords.forEach( word => {
        $labels.eq( word - 1 ).addClass( 'incorrect-word' );
    } );
};

LiteracyWidget.prototype._convertSpaceList = spaceList => {
    const arr = spaceList.split( ' ' ).map( item => item === 'null' ? null : Number( item ) );

    return {
        flashCount: arr[ 0 ],
        finishCount: arr[ 2 ],
        finishTime: arr[ 1 ],
        incorrectWords: arr.splice( 10 )
    };
};

export default LiteracyWidget;
