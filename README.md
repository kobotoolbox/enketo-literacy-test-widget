Literacy Test Widget
==========

To add this widget to your Enketo Express installation see [this guidance](https://github.com/kobotoolbox/enketo-express/blob/master/tutorials/34-custom-widgets.md).

Works on all regular (non-minimal) "select multiple" questions with the `"literacy"` appearance. It cannot be used in conjunction with other appearances. It works with all themes, but the Grid Theme is likely most suitable.

Note that this widget is a custom hack for which we cannot device a proper sane XForm syntax. It is therefore not suitable for inclusion in the common Enketo tools and the ODK XForms specification.

## Very basic usage information

1. Evaluator clicks Start;
1. Reader starts reading;
1. Evaluator clicks any words (not checkboxes) that the reader cannot read, marking them with strikethrough;
1. Some duration (the "flash time") elapses;
1. Evaluator sees yellow screen;
1. Evaluator clicks the check box to indicate how far the reader has progressed, i.e. what was the last word read when the yellow "flash" screen appeared;
1. Yellow screen goes away; evaluator continues clicking words the when the reader struggles;
1. Reader finishes (or gives up, or exceeds some maximum amount of time¹);
1. Evaluator clicks Finish;
1. Evaluator then clicks the final word read by the reader, which is then highlighted in red.

¹ The evaluator just needs to know the maximum time and click finish once that elapses. It's not a setting stored in the form.

:information_source: The collected data has to go through formpack to make sense (see https://github.com/kobotoolbox/formpack/issues/145), so **try an XLSX export** when testing **instead of looking at the table view** (or any other view in the KPI UI). 

There's a sloppy [screencast of this available](https://chat.kobotoolbox.org/#narrow/stream/13-Enketo/topic/STC.20literacy.20widget/near/128399) (internally only—sorry!).
