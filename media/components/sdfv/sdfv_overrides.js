// Copyright 2020-2021 ETH Zurich and the DaCe-VSCode authors.
// All rights reserved.

/**
 * Set the header/title of the info-box in the embedded view.
 * @param {*} title Title to set
 */
function info_box_set_title(title) {
    $('#info-title').text(title);
}

/**
 * Get the current info-box contents.
 */
function info_box_get_contents() {
    return document.getElementById('info-contents');
}

/**
 * Show the info box and its necessary components.
 */
function info_box_show() {
    $('#info-clear-btn').show();
}

/**
 * Clear the info container and its title.
 * This also hides the clear button again.
 */
function clear_info_box() {
    $('#info-contents').html('');
    $('#info-title').text('');
    $('#info-clear-btn').hide();
    $('#goto-source-btn').hide();
    window.selected_transformation = undefined;
    if (vscode)
        vscode.postMessage({
            'type': 'transformation_list.deselect',
        });
}

/**
 * Fill out the info-box of the embedded layout with info about an element.
 * This dynamically builds one or more tables showing all of the relevant info
 * about a given element.
 * @param {*} elem  The element to display info about
 */
function fill_info_embedded(elem) {
    const gotoSourceBtn = $('#goto-source-btn');
    // Clear and hide the go to source button.
    gotoSourceBtn.hide();
    gotoSourceBtn.off('click');
    gotoSourceBtn.prop('title', '');

    if (elem) {
        let metadata = undefined;
        if (window.sdfg_meta_dict) {
            if (elem.data) {
                if (elem.data.sdfg) {
                    metadata = window.sdfg_meta_dict[elem.data.sdfg.type];
                } else if (elem.data.state) {
                    metadata = window.sdfg_meta_dict[elem.data.state.type];
                } else if (elem.data.node) {
                    const node_type = elem.data.node.type;
                    if (node_type === 'MapEntry' || node_type === 'MapExit')
                        metadata = window.sdfg_meta_dict['Map'];
                    else if (node_type === 'LibraryNode')
                        metadata = window.sdfg_meta_dict[
                            elem.data.node.classpath
                        ];
                    else
                        metadata = window.sdfg_meta_dict[elem.data.node.type];
                } else if (elem.data.type) {
                    metadata = window.sdfg_meta_dict[elem.data.type];
                }
            }
            console.log(elem, metadata, window.sdfg_meta_dict);
        } else {
            // If SDFG property metadata isn't available, query it from DaCe.
            vscode.postMessage({
                type: 'dace.query_sdfg_metadata',
            });
        }

        document.getElementById('info-title').innerText =
            elem.type() + ' ' + elem.label();

        const contents = $('#info-contents');
        contents.html('');
        if (elem instanceof Edge && elem.data.type === 'Memlet') {
            let sdfg_edge = elem.sdfg.nodes[elem.parent_id].edges[elem.id];
            $('<p>', {
                'class': 'info-subtitle',
                'html': 'Connectors: ' + sdfg_edge.src_connector +
                    ' <i class="material-icons">arrow_forward</i> ' +
                    sdfg_edge.dst_connector,
            }).appendTo(contents);
            $('<hr>').appendTo(contents);
        }

        const attr_table = $('<table>', {
            id: 'sdfg-attribute-table',
            'class': 'info-table',
        }).appendTo(contents);
        const attr_table_header = $('<thead>').appendTo(attr_table);
        const attr_table_header_row = $('<tr>').appendTo(attr_table_header);
        $('<th>', {
            'class': 'key-col',
            'text': 'Attribute',
        }).appendTo(attr_table_header_row);
        $('<th>', {
            'class': 'val-col',
            'text': 'Value',
        }).appendTo(attr_table_header_row);

        const attr_table_body = $('<tbody>').appendTo(attr_table);
        for (const attr of Object.entries(elem.attributes())) {
            if (attr[0] === 'layout' || attr[0] === 'sdfg' ||
                attr[0] === 'is_collapsed' || attr[0] === 'orig_sdfg' ||
                attr[0] === 'transformation_hist' || attr[0].startsWith('_'))
                continue;
            const val = sdfg_property_to_string(
                attr[1],
                renderer.view_settings()
            );
            /*
            if (val === null || val === '')
                continue;
                */

            let datatype = undefined;
            let choices = undefined;
            if (metadata && metadata[attr[0]]) {
                if (metadata[attr[0]]['metatype'])
                    datatype = metadata[attr[0]]['metatype'];
                if (metadata[attr[0]]['choices'])
                    choices = metadata[attr[0]]['choices'];
            }

            if (attr[0] === 'debuginfo') {
                if (attr[1]) {
                    gotoSourceBtn.on('click', function() {
                        gotoSource(
                            attr[1].filename,
                            attr[1].start_line,
                            attr[1].start_column,
                            attr[1].end_line,
                            attr[1].end_column
                        );
                    });
                    gotoSourceBtn.prop('title',
                        attr[1].filename + ':' + attr[1].start_line
                    );
                    gotoSourceBtn.show();
                }
                continue;
            }

            const row = $('<tr>').appendTo(attr_table_body);
            const title_cell = $('<th>', {
                'class': 'key-col',
                'text': attr[0],
            }).appendTo(row);

            let input_element = undefined;
            if (datatype === 'bool') {
                const attr_bool_box = $('<input>', {
                    'type': 'checkbox',
                    'checked': attr[1],
                });
                const table_cell = $('<td>', {
                    'class': 'val-col',
                }).appendTo(row);
                table_cell.append(attr_bool_box);
                input_element = attr_bool_box;
            } else if (datatype === 'str') {
                const attr_text_box = $('<input>', {
                    'type': 'text',
                    'value': attr[1],
                });
                const table_cell = $('<td>', {
                    'class': 'val-col',
                }).appendTo(row);
                table_cell.append(attr_text_box);
                input_element = attr_text_box;
            } else if (datatype === 'int') {
                const attr_number_box = $('<input>', {
                    'type': 'number',
                    'value': attr[1],
                });
                const table_cell = $('<td>', {
                    'class': 'val-col',
                }).appendTo(row);
                table_cell.append(attr_number_box);
                input_element = attr_number_box;
            } else if (datatype === 'DataProperty') {
                const cell = $('<td>', {
                    'class': 'val-col',
                }).appendTo(row);

                const attr_data_prop_box = $('<select>', {
                    'class': 'sdfv-property-dropdown',
                }).appendTo(cell);
                input_element = attr_data_prop_box;

                Object.keys(elem.sdfg.attributes._arrays).forEach(array => {
                    attr_data_prop_box.append(new Option(
                        array,
                        array,
                        false,
                        array === attr[1]
                    ));
                });
            } else {
                console.log(datatype, choices);
                if (choices !== undefined) {
                    const cell = $('<td>', {
                        'class': 'val-col',
                    }).appendTo(row);

                    const attr_select_box = $('<select>', {
                        'class': 'sdfv-property-dropdown',
                    }).appendTo(cell);
                    input_element = attr_select_box;

                    choices.forEach(el => {
                        attr_select_box.append(new Option(
                            el,
                            el,
                            false,
                            el === attr[1]
                        ));
                    });
                } else {
                    $('<td>', {
                        'class': 'val-col',
                        'html': val,
                    }).appendTo(row);
                    if (datatype !== undefined)
                        title_cell.text(
                            title_cell.text() + ' (' + datatype + ')'
                        );
                }
            }

            if (input_element !== undefined)
                input_element.on('change', () => {
                    if (elem && elem.data) {
                        if (elem.data.attributes)
                            elem.data.attributes[
                                attr[0]
                            ] = input_element.val();
                        else if (elem.data.node)
                            elem.data.node.attributes[
                                attr[0]
                            ] = input_element.val();
                        else if (elem.data.state)
                            elem.data.state.attributes[
                                attr[0]
                            ] = input_element.val();

                        let g = renderer.sdfg;

                        // The renderer uses a graph representation with
                        // additional information, and to make sure that
                        // the classical SDFG representation and that graph
                        // representation are kept in sync, the SDFG object
                        // is made cyclical. We use this to break the
                        // renderer's SDFG representation back down into the
                        // classical one, removing layout information along
                        // with it.
                        function unGraphifySdfg(g) {
                            g.edges.forEach((e) => {
                                if (e.attributes.data.edge)
                                    delete e.attributes.data.edge;
                            });

                            g.nodes.forEach((s) => {
                                if (s.attributes.layout)
                                    delete s.attributes.layout;

                                s.edges.forEach((e) => {
                                    if (e.attributes.data.edge)
                                        delete e.attributes.data.edge;
                                });

                                s.nodes.forEach((v) => {
                                    if (v.attributes.layout)
                                        delete v.attributes.layout;

                                    if (v.type === 'NestedSDFG')
                                        unGraphifySdfg(v.attributes.sdfg);
                                });
                            });
                        }

                        unGraphifySdfg(g);

                        vscode.postMessage({
                            type: 'dace.write_edit_to_sdfg',
                            sdfg: JSON.stringify(g),
                        });
                    }
                });
        }

        // If we're processing an access node, add array information too
        if (elem instanceof AccessNode) {
            const sdfg_array = elem.sdfg.attributes._arrays[
                elem.attributes().data
            ];
            $('<br>').appendTo(contents);
            $('<p>', {
                'class': 'info-subtitle',
                'text': sdfg_array.type + ' properties:',
            }).appendTo(contents);

            const array_table = $('<table>', {
                id: 'sdfg-array-table',
                'class': 'info-table',
            }).appendTo(contents);
            const array_table_header = $('<thead>').appendTo(array_table);
            const array_table_header_row =
                $('<tr>').appendTo(array_table_header);
            $('<th>', {
                'class': 'key-col',
                'text': 'Property',
            }).appendTo(array_table_header_row);
            $('<th>', {
                'class': 'val-col',
                'text': 'Value',
            }).appendTo(array_table_header_row);

            const array_metadata = window.sdfg_meta_dict[sdfg_array.type];

            const array_table_body = $('<tbody>').appendTo(array_table);
            for (const attr of Object.entries(sdfg_array.attributes)) {
                let array_datatype = undefined;
                let array_choices = undefined;
                if (array_metadata && array_metadata[attr[0]]) {
                    if (array_metadata[attr[0]]['metatype'])
                        array_datatype = array_metadata[attr[0]]['metatype'];
                    if (array_metadata[attr[0]]['choices'])
                        array_choices = array_metadata[attr[0]]['choices'];
                }

                if (attr[0] === 'layout' || attr[0] === 'sdfg' ||
                    attr[0].startsWith('_meta_'))
                    continue;
                const val = sdfg_property_to_string(
                    attr[1],
                    renderer.view_settings()
                );
                /*
                if (val === null || val === '')
                    continue;
                    */

                const row = $('<tr>').appendTo(array_table_body);
                const title_cell = $('<th>', {
                    'class': 'key-col',
                    'text': attr[0],
                }).appendTo(row);

                let array_input_element = undefined;
                if (array_datatype === 'bool') {
                    const attr_bool_box = $('<input>', {
                        'type': 'checkbox',
                        'checked': attr[1],
                    });
                    const table_cell = $('<td>', {
                        'class': 'val-col',
                    }).appendTo(row);
                    table_cell.append(attr_bool_box);
                    array_input_element = attr_bool_box;
                } else if (array_datatype === 'str') {
                    const attr_text_box = $('<input>', {
                        'type': 'text',
                        'value': attr[1],
                    });
                    const table_cell = $('<td>', {
                        'class': 'val-col',
                    }).appendTo(row);
                    table_cell.append(attr_text_box);
                    array_input_element = attr_text_box;
                } else if (array_datatype === 'int') {
                    const attr_number_box = $('<input>', {
                        'type': 'number',
                        'value': attr[1],
                    });
                    const table_cell = $('<td>', {
                        'class': 'val-col',
                    }).appendTo(row);
                    table_cell.append(attr_number_box);
                    array_input_element = attr_number_box;
                } else {
                    if (array_choices !== undefined) {
                        const cell = $('<td>', {
                            'class': 'val-col',
                        }).appendTo(row);

                        const attr_select_box = $('<select>', {
                            'class': 'sdfv-property-dropdown',
                        }).appendTo(cell);
                        array_input_element = attr_select_box;

                        array_choices.forEach(el => {
                            attr_select_box.append(new Option(
                                el,
                                el,
                                false,
                                el === attr[1]
                            ));
                        });
                    } else {
                        $('<td>', {
                            'class': 'val-col',
                            'html': val,
                        }).appendTo(row);
                        if (array_datatype !== undefined)
                            title_cell.text(
                                title_cell.text() + ' (' + array_datatype + ')'
                            );
                    }
                }

                if (array_input_element !== undefined)
                    array_input_element.change(() => {
                        if (sdfg_array && sdfg_array.attributes) {
                            sdfg_array.attributes[
                                attr[0]
                            ] = array_input_element.val();

                            let g = renderer.sdfg;

                            // The renderer uses a graph representation with
                            // additional information, and to make sure that
                            // the classical SDFG representation and that graph
                            // representation are kept in sync, the SDFG object
                            // is made cyclical. We use this to break the
                            // renderer's SDFG representation back down into the
                            // classical one, removing layout information along
                            // with it.
                            function unGraphifySdfg(g) {
                                g.edges.forEach((e) => {
                                    if (e.attributes.data.edge)
                                        delete e.attributes.data.edge;
                                });

                                g.nodes.forEach((s) => {
                                    if (s.attributes.layout)
                                        delete s.attributes.layout;

                                    s.edges.forEach((e) => {
                                        if (e.attributes.data.edge)
                                            delete e.attributes.data.edge;
                                    });

                                    s.nodes.forEach((v) => {
                                        if (v.attributes.layout)
                                            delete v.attributes.layout;

                                        if (v.type === 'NestedSDFG')
                                            unGraphifySdfg(v.attributes.sdfg);
                                    });
                                });
                            }

                            unGraphifySdfg(g);

                            vscode.postMessage({
                                type: 'dace.write_edit_to_sdfg',
                                sdfg: JSON.stringify(g),
                            });
                        }
                    });
            }
        }

        $('#info-clear-btn').show();
    } else {
        clear_info_box();
    }
}

function embedded_outline(renderer, graph) {
    if (vscode === undefined)
        return;

    const outline_list = [];

    const top_level_sdfg = {
        'icon': 'res:icon-theme/sdfg.svg',
        'type': 'SDFG',
        'label': `SDFG ${renderer.sdfg.attributes.name}`,
        'collapsed': false,
        'uuid': get_uuid_graph_element(undefined),
        'children': [],
    };
    outline_list.push(top_level_sdfg);

    const stack = [top_level_sdfg];

    traverse_sdfg_scopes(graph, (node, parent) => {
        // Skip exit nodes when scopes are known.
        if (node.type().endsWith('Exit') && node.data.node.scope_entry >= 0) {
            stack.push(undefined);
            return true;
        }

        // Create an entry.
        let is_collapsed = node.attributes().is_collapsed;
        is_collapsed = (is_collapsed === undefined) ? false : is_collapsed;
        let node_label = node.label();
        if (node.type() === 'NestedSDFG')
            node_label = node.data.node.label;

        // If a scope has children, remove the name "Entry" from the type.
        let node_type = node.type();
        if (node_type.endsWith('Entry')) {
            const state = node.sdfg.nodes[node.parent_id];
            if (state.scope_dict[node.id] !== undefined)
                node_type = node_type.slice(0, -5);
        }

        let icon;
        switch (node_type) {
            case 'Tasklet':
                icon = 'code';
                break;
            case 'Map':
                icon = 'call_split';
                break;
            case 'SDFGState':
                icon = 'crop_square';
                break;
            case 'AccessNode':
                icon = 'fiber_manual_record';
                break;
            case 'NestedSDFG':
                icon = 'res:icon-theme/sdfg.svg';
                break;
            default:
                icon = '';
                break;
        }

        stack.push({
            'icon': icon,
            'type': node_type,
            'label': node_label,
            'collapsed': is_collapsed,
            'uuid': get_uuid_graph_element(node),
            'children': [],
        });

        // If the node's collapsed we don't traverse any further.
        if (is_collapsed)
            return false;
    }, (node, parent) => {
        // After scope ends, pop ourselves as the current element and add
        // outselves to the parent.
        const elem = stack.pop();
        const elem_parent = stack[stack.length - 1];
        if (elem !== undefined && elem_parent !== undefined)
            elem_parent['children'].push(elem);
    });

    vscode.postMessage({
        type: 'outline.set_outline',
        outline_list: outline_list,
    });
}

function init_info_box() {
    // Pass
}

// Redefine the standard SDFV sidebar interface with the one for the info-box.
init_menu = init_info_box;
sidebar_set_title = info_box_set_title;
sidebar_show = info_box_show;
sidebar_get_contents = info_box_get_contents;
close_menu = clear_info_box;
outline = embedded_outline;
// Redefine the standard SDFV element information-display function with the one
// for the embedded layout.
fill_info = fill_info_embedded;
