try { __liberator_eval_result = eval(__liberator_eval_string);
}
catch (e)
{
    __liberator_eval_error = e;
}
// Important: The eval statement *must* remain on the first line
// in order for line numbering in any errors to remain correct.
//
// vim: set fdm=marker sw=4 ts=4 et:
