import Widget from 'enketo-core/src/js/widget';
const FLASH = 'flash';
const STOP = 'stop';
const START = 'start';
const FINISH = 'finish';

// TODO: add disable/enable functions

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
        const i = this.element.querySelector( 'input[type="text"], input[type="checkbox"]' );
        const words = this.element.querySelectorAll( '.option-wrapper label' );

        props.flashTime = !isNaN( this.element.dataset.flash ) ? Number( this.element.dataset.flash ) : 60;

        props.name = i.name;
        props.numberWords = words.length;
        props.relevant = i.dataset.relevant || '';
        props.constraint = i.dataset.constraint || '';
        props.required = i.dataset.required || '';

        return props;
    }

    _init() {
        const fragment = document.createRange();
        let existingValue;

        if ( !this.element.querySelector( 'input[type="checkbox"]' ) || this.element.querySelector( 'input[type="checkbox"][readonly]' ) ) {
            console.error( 'literacy widget cannot be instantiated on this question type' );
            return;
        }

        const name = this.props.name;

        // It is highly unusual to obtain the value from the model like this, but the form engine has attempted 
        // to load the model value in the checkboxes and failed with the first 10 items in the space-separated list.
        // For loading, a regular text input would have been better, but we would not have had the benefit of a almost
        // complete DOM with all the words. So it's a compromise.
        existingValue = this._getCurrentModelValue();

        this.checkboxes = [ ...this.element.querySelectorAll( 'input[type="checkbox"]' ) ];

        this.checkboxes.forEach( el => {
            el.classList.add( 'ignore' );
            el.removeAttribute( 'name' );
            el.removeAttribute( 'data-type-xml' );
            el.removeAttribute( 'data-relevant' );
            el.removeAttribute( 'data-required' );
            el.disabled = true;
        } );

        const optionWrapper = this.element.querySelector( '.option-wrapper' );

        optionWrapper.classList.add( 'widget', 'literacy-widget' );

        optionWrapper.after(
            // Create a hidden replacement input to will serve as the 'original'. 
            // This is a very unusual approach as usually we leave the original intact.
            fragment.createContextualFragment(
                `<input type="text" name="${name}" ${this.props.readonly ? 'readonly' : ''}${[ 'required', 'constraint', 'relevant' ].map( item => this.props[ item ] ? `data-${item}="${this.props[ item ]}" ` : '' ).join( '' )}/>`
            )
        );

        this.input = this.element.querySelector( `input[name="${name}"]` );

        optionWrapper.prepend(
            fragment.createContextualFragment(
                `<button class="btn btn-default literacy-widget__start" type="button">Start</button>
                <div class="literacy-widget__timer"/>`
            )
        );

        const startButton = optionWrapper.querySelector( '.literacy-widget__start' );
        //const timer = optionWrapper.querySelector( '.literacy-widget__timer' );

        optionWrapper.append(
            fragment.createContextualFragment(
                `<button class="btn btn-primary literacy-widget__stop" disabled type="button">Finish</button>
                <button class="btn-icon-only btn-reset" type="button"><i class="icon icon-refresh"> </i></button>`
            )
        );

        const stopButton = optionWrapper.querySelector( '.literacy-widget__stop' );
        const resetButton = optionWrapper.querySelector( '.btn-reset' );

        this._addResetHandler( resetButton );
        resetButton.click();
        this._addTimerHandlers( startButton, stopButton );
        this._addWordHandlers();

        if ( existingValue ) {
            this.input.value = existingValue;
            this._loadValues( this._convertSpaceList( existingValue ) );
            this._setState( FINISH );
        }
    }

    _getCurrentModelValue() {
        const context = this.props.name.split( '/' ).length > 3 ? this.props.name.substring( 0, this.props.name.lastIndexOf( '/' ) ) : null;
        const closestRepeat = this.element.closest( '.or-repeat[name]' );
        const index = closestRepeat ? [ ...this.element.closest( 'form.or' ).querySelectorAll( `.or-repeat[name="${closestRepeat.getAttribute( 'name' )}"]` ) ].indexOf( closestRepeat ) : 0;
        return this.options.helpers.evaluate( this.props.name, 'string', context, index );
    }

    _addResetHandler( resetButton ) {
        resetButton.addEventListener( 'click', () => {
            if ( this.timer && this.timer.interval ) {
                clearInterval( this.timer.interval );
            }
            this.timer = {
                elapsed: 0,
                element: this.element.querySelector( '.literacy-widget__timer' ),
                interval: null,
                state: null
            };
            this.result = {
                flashWordIndex: null,
                lastWordIndex: null
            };
            this.input.value = '';
            this.input.dispatchEvent( new Event( 'change' ) );
            this._resetCheckboxes();
            this._resetWords();
            this._updateTimer();
            this._setState( null );
        } );
    }

    _addTimerHandlers( startButton, stopButton ) {
        this._updateTimer();

        startButton.addEventListener( 'click', () => {
            this.timer.interval = setInterval( this._tick.bind( this ), 1000 );
            this._setState( START );
            stopButton.disabled = false;
        } );

        stopButton.addEventListener( 'click', () => {
            clearInterval( this.timer.interval );
            this._setState( STOP );
            stopButton.disabled = true;
        } );
    }

    /**
     * Handlers for clicking words and checkboxes.
     * The state determines whether these handlers actually perform any action!
     */
    _addWordHandlers() {

        // TODO: if we only allow one type of click at a time, we should remove this
        this.element.addEventListener( 'click', evt => {
            const target = evt.target;
            // only register clicks on checkbox itself, not on label
            if ( target.nodeName.toLowerCase() === 'input' ) {
                return true;
            } else {
                return false;
            }
        } );

        this.element.querySelectorAll( '.option-label' )
            .forEach( el => el.addEventListener( 'click', evt => {
                if ( [ START, STOP, FLASH ].indexOf( this.timer.state ) !== -1 ) {
                    evt.target.closest( 'label' ).classList.toggle( 'incorrect-word' );
                }
            } ) );

        this.element.addEventListener( 'change', evt => {
            if ( evt.target.matches( 'input[type="checkbox"]' ) ) {
                if ( evt.target.checked && this.timer.state === FLASH ) {
                    this.result.flashWordIndex = this._getCheckboxIndex( evt.target );
                    this._setState( START );
                } else if ( evt.target.checked && this.timer.state === STOP ) {
                    let values;
                    this.result.lastWordIndex = this._getCheckboxIndex( evt.target );
                    values = this._getValues();
                    this.input.value = values.xmlValue;
                    this.input.dispatchEvent( new Event( 'change' ) );
                    this._setState( FINISH );
                }
            }
        } );
    }

    _resetWords() {
        this.element
            .querySelectorAll( '.incorrect-word, .at-flash, .at-end, .unread' )
            .forEach( el => el.classList.remove( 'incorrect-word', 'at-flash', 'at-end', 'unread' ) );
    }

    _hideCheckboxes() {
        this.checkboxes.forEach( el => el.disabled = true );
    }

    _getCheckboxIndex( input ) {
        return this.checkboxes.indexOf( input );
    }

    _showCheckboxes( startIndex ) {
        startIndex = startIndex || 0;
        this.checkboxes.slice( startIndex ).forEach( el => el.disabled = false );
    }

    _resetCheckboxes() {
        this.checkboxes.forEach( el => el.checked = false );
    }

    /* 
     * Sets the state variable and sets the UI state by showing/hiding/styling things.
     * 
     * Note, I had some trouble properly separating state from actions, so there
     * is opportunity to improve this, by moving things from button handlers to this function or 
     * the other way around.
     */
    _setState( state ) {
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
                lastIncorrectIndex = this._getCheckboxIndex( [ ...this.element.querySelectorAll( '.incorrect-word input[type="checkbox"]' ) ].pop() );
                this._showCheckboxes( ( this.result.flashWordIndex >= lastIncorrectIndex ? this.result.flashWordIndex : lastIncorrectIndex ) );
                break;
            case FLASH:
                lastIncorrectIndex = this._getCheckboxIndex( [ ...this.element.querySelectorAll( '.incorrect-word input[type="checkbox"]' ) ].pop() );
                this._showCheckboxes( lastIncorrectIndex || 0 );
                break;
            case FINISH:
                this._updateWordCounts();
                this._hideCheckboxes();
                break;
            default:
                this._hideCheckboxes();
        }
    }

    _updateTimer() {
        this.timer.element.textContent = this._formatTime( this.timer.elapsed );
    }

    _updateWordCounts() {
        if ( this.result.flashWordIndex !== null ) {
            this.checkboxes[ this.result.flashWordIndex ].parentElement.classList.add( 'at-flash' );
        }
        if ( this.result.lastWordIndex !== null ) {
            this.checkboxes[ this.result.lastWordIndex ].parentElement.classList.add( 'at-end' );

            let index = this.result.lastWordIndex + 1;
            while ( this.checkboxes[ index ] ) {
                this.checkboxes[ index ].parentElement.classList.add( 'unread' );
                index++;
            }
        }
    }

    _formatTime( time ) {
        const hrs = ~~( time / 3600 );
        const mins = ~~( ( time % 3600 ) / 60 );
        const secs = time % 60;
        let formattedTime = '';
        if ( hrs > 0 ) {
            formattedTime += `${ hrs }:${ mins < 10 ? '0' : ''}`;
        }
        formattedTime += `${ mins }:${ secs < 10 ? '0' : ''}`;
        formattedTime += `${ secs }`;
        return formattedTime;
    }

    _tick() {
        this.timer.elapsed++;
        this._updateTimer();
        if ( this.timer.elapsed === this.props.flashTime ) {
            this._setState( FLASH );
        }
    }

    _getValues() {
        const finishCount = this.result.lastWordIndex !== null ? this.result.lastWordIndex + 1 : null;
        const flashCount = this.result.flashWordIndex !== null ? this.result.flashWordIndex + 1 : null;
        const incorrectWords = [ ...this.element.querySelectorAll( '.incorrect-word input' ) ].map( el => el.value );

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
    }

    _loadValues( values ) {
        const labels = this.checkboxes.map( el => el.parentElement );
        this.timer.elapsed = values.finishTime;
        this.result.lastWordIndex = values.finishCount !== null ? values.finishCount - 1 : null;
        this.result.flashWordIndex = values.flashCount !== null ? values.flashCount - 1 : null;

        this._updateTimer();
        this._updateWordCounts();

        values.incorrectWords.forEach( word => {
            labels[ word - 1 ].classList.add( 'incorrect-word' );
        } );
    }

    _convertSpaceList( spaceList ) {
        const arr = spaceList.split( ' ' ).map( item => item === 'null' ? null : Number( item ) );

        return {
            flashCount: arr[ 0 ],
            finishCount: arr[ 2 ],
            finishTime: arr[ 1 ],
            incorrectWords: arr.splice( 10 )
        };
    }

}

export default LiteracyWidget;
