'use strict';

/**
 * Literacy Timer Widget
 */

var Widget = require( 'enketo-core/src/js/Widget' );
var $ = require( 'jquery' );
var pluginName = 'literacyWidget';
var FLASH = 'flash';
var STOP = 'stop';
var START = 'start';
var FINISH = 'finish';

/**
 * Conduct Literacy Tests as part of an Enketo Form
 *
 * @constructor
 * @param {Element}                       element   Element to apply widget to.
 * @param {{}|{helpers: *}}                             options   options
 * @param {*=}                            event     event
 */
function LiteracyWidget( element, options ) {
    // set the namespace (important!)
    this.namespace = pluginName;
    // call the Super constructor
    Widget.call( this, element, options );
    this._init();
}

LiteracyWidget.prototype = Object.create( Widget.prototype );
LiteracyWidget.prototype.constructor = LiteracyWidget;

LiteracyWidget.prototype._init = function() {
    var that = this;
    var $startButton = $( '<button class="btn btn-default literacy-widget__start" type="button">Start</button>' );
    var $stopButton = $( '<button class="btn btn-primary literacy-widget__stop" disabled type="button">Finish</button>' );
    var $resetButton = $( '<button class="btn-icon-only btn-reset" type="button"><i class="icon icon-refresh"> </i></button></div>' );
    var $timer = $( '<div class="literacy-widget__timer"/>' );
    var $report = $( '<div class="literacy-widget__report">' );
    var existingValue;

    this.props = this._getProps();

    // It is highly unusual to obtain the value from the model like this, but the form engine has attempted 
    // to load the model value in the checkboxes and failed with the first 10 items in the space-separated list.
    // For loading, a regular text input would have been better, but we would not have had the benefit of a almost
    // complete DOM with all the words. So it's a compromise.
    existingValue = this._getCurrentModelValue();

    // Create a hidden replacement input to will serve as the 'original'. 
    // This is a very unusual approach as usually we leave the original intact.
    this.$input = $( '<input type="text" name="' + this.props.name + '" ' + ( this.props.readonly ? 'readonly' : '' ) +
        ( [ 'required', 'constraint', 'relevant' ].map( function( item ) {
            return that.props[ item ] ? 'data-' + item + '="' + that.props[ item ] + '" ' : '';
        } ).join( '' ) ) + '/>' );
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
        this._setState( FINISH );
    }
};

LiteracyWidget.prototype._getCurrentModelValue = function() {
    var context = this.props.name.split( '/' ).length > 3 ? this.props.name.substring( 0, this.props.name.lastIndexOf( '/' ) ) : null;
    var $closestRepeat = $( this.element ).closest( '.or-repeat' );
    var index = $( 'form.or .or-repeat[name="' + $closestRepeat.attr( 'name' ) + '"]' ).index( $closestRepeat );
    return this.options.helpers.evaluate( this.props.name, 'string', context, index );
};

LiteracyWidget.prototype._getProps = function() {
    var i = this.element.querySelector( 'input[type="checkbox"]' );
    var words = this.element.querySelectorAll( '.option-wrapper label' );
    return {
        readonly: i.readOnly,
        flashTime: !isNaN( this.element.dataset.flash ) ? Number( this.element.dataset.flash ) : 60,
        name: i.name,
        numberWords: words.length,
        relevant: i.dataset.relevant || '',
        constraint: i.dataset.constraint || '',
        required: i.dataset.required || ''
    };
};

LiteracyWidget.prototype._addResetHandler = function( $resetButton ) {
    var that = this;

    $resetButton.on( 'click', function() {
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
    var that = this;
    this._updateTimer();

    $startButton.on( 'click', function() {
        that.timer.interval = setInterval( that._tick.bind( that ), 1000 );
        that._setState( START );
        $stopButton.prop( 'disabled', false );
    } );

    $stopButton.on( 'click', function() {
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
    var that = this;

    // TODO: if we only allow one type of click at a time, we should remove this
    $( this.element ).on( 'click', function( evt ) {
        var target = evt.target;
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

    $( this.element ).on( 'change.' + this.namespace, 'input[type="checkbox"]', function() {
        if ( this.checked && that.timer.state === FLASH ) {
            that.result.flashWordIndex = that._getCheckboxIndex( this );
            this.parentNode.classList.add( 'at-flash' );
            that._setState( START );
        } else if ( this.checked && that.timer.state === STOP ) {
            var values;
            that.result.lastWordIndex = that._getCheckboxIndex( this );
            this.parentNode.classList.add( 'at-end' );
            values = that._getValues();
            that.$input.val( values.xmlValue ).trigger( 'change' );
            $( this ).closest( 'label' ).nextAll( 'label' ).addClass( 'unread' );
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
    var lastIncorrectIndex;
    this.element.classList.remove( START, STOP, FLASH, FINISH );
    this.timer.state = state;
    if ( state ) {
        this.element.classList.add( state );
    }
    switch ( state ) {
        case START:

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
            this._hideCheckboxes();
            break;
        default:
            this._hideCheckboxes();
    }
};

LiteracyWidget.prototype._updateTimer = function() {
    this.timer.element.textContent = this._formatTime( this.timer.elapsed );
};

LiteracyWidget.prototype._formatTime = function( time ) {
    var hrs = ~~( time / 3600 );
    var mins = ~~( ( time % 3600 ) / 60 );
    var secs = time % 60;
    var formattedTime = "";
    if ( hrs > 0 ) {
        formattedTime += "" + hrs + ":" + ( mins < 10 ? "0" : "" );
    }
    formattedTime += "" + mins + ":" + ( secs < 10 ? "0" : "" );
    formattedTime += "" + secs;
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
    var finishCount = this.result.lastWordIndex !== null ? this.result.lastWordIndex + 1 : null;
    var flashCount = this.result.flashWordIndex !== null ? this.result.flashWordIndex + 1 : null;
    var incorrectWords = $( this.element ).find( '.incorrect-word input' ).map( function() {
        return this.value;
    } ).get();

    return {
        flashCount: flashCount,
        finishCount: finishCount,
        finishTime: this.timer.elapsed,
        incorrectWords: incorrectWords,
        xmlValue: [ flashCount, this.timer.elapsed, finishCount, null, null, null, null, null, null, null ]
            .map( function( item ) {
                if ( item === null || typeof item === 'undefined' ) {
                    return 'null';
                }
                return item;
            } )
            .concat( incorrectWords ).join( ' ' )
    };
};

LiteracyWidget.prototype._convertSpaceList = function( spaceList ) {
    var arr = spaceList.split( ' ' );
    var incorrectWords = arr.splice( 10 );
    var finishTime = arr[ 1 ];
    var finishCount = arr[ 2 ];
    var finishCorrect = finishCount - incorrectWords.length;
    return {
        flashCount: arr[ 0 ],
        finishTime: finishTime,
        finishCount: finishCount,
        finishPercentageCorrect: this._getPercentageCorrect( finishCorrect, finishCount ),
        finishWordsPerMinute: this._getWpm( finishCorrect, finishTime )
    };
};

$.fn[ pluginName ] = function( options, event ) {

    options = options || {};

    return this.each( function() {
        var $this = $( this );
        var data = $this.data( pluginName );

        if ( !this.querySelector( 'input[type="checkbox"]' ) || this.querySelector( 'input[type="checkbox"][readonly]' ) ) {
            return;
        }

        // only instantiate if options is an object (i.e. not a string) and if it doesn't exist already
        if ( !data && typeof options === 'object' ) {
            $this.data( pluginName, new LiteracyWidget( this, options, event ) );
        }
        // only call method if widget was instantiated before
        else if ( data && typeof options == 'string' ) {
            // pass the element as a parameter
            data[ options ]( this );
        }
    } );
};

// returns its own properties so we can use this to instantiate the widget
module.exports = {
    'name': pluginName,
    // add selector to be used for the widget
    'selector': '.or-appearance-literacy.simple-select',
    'helpersRequired': [ 'evaluate' ]
};
