// Copyright 2020-2021 ETH Zurich and the DaCe-VSCode authors.
// All rights reserved.

class VSCodeRenderer extends daceSDFGRenderer {

    constructor(sdfg, container, on_mouse_event = null, user_transform = null,
        debug_draw = false, background = null, mode_buttons = null) {

        if (!mode_buttons) {
            let pan_btn = document.getElementById('pan-btn');
            let move_btn = document.getElementById('move-btn');
            let select_btn = document.getElementById('select-btn');
            let add_btns = [
                document.getElementById('elem_access_node'),
                document.getElementById('elem_map'),
                document.getElementById('elem_consume'),
                document.getElementById('elem_tasklet'),
                document.getElementById('elem_nested_sdfg'),
                document.getElementById('elem_libnode'),
                document.getElementById('elem_state'),
                document.getElementById('elem_edge'),
            ];
            if (pan_btn)
                mode_buttons = {
                    pan: pan_btn,
                    move: move_btn,
                    select: select_btn,
                    add_btns: add_btns
                };
        }

        super(sdfg, container, on_mouse_event, user_transform,
              debug_draw, background, mode_buttons);
    }

    send_new_sdfg_to_vscode() {
        vscode_write_graph(this.sdfg);
    }

    add_node_to_graph(
        add_type, parent, edge_a = undefined
    ) {
        let g = this.sdfg;
        un_graphiphy_sdfg(g);
        vscode.postMessage({
            type: 'dace.insert_node',
            sdfg: JSON.stringify(g),
            add_type: add_type,
            parent: parent,
            edge_a: edge_a,
        });
    }

    remove_graph_nodes(nodes) {
        let g = this.sdfg;
        un_graphiphy_sdfg(g);

        const uuids = [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const uuid = daceGetUUIDGraphElement(node);
            uuids.push(uuid);

            // If we're deleting a scope node, we want to remove the
            // corresponding entry/exit node as well.
            let other_uuid = undefined;
            if (node instanceof EntryNode)
                other_uuid = node.sdfg.sdfg_list_id + '/' +
                    node.parent_id + '/' +
                    node.data.node.scope_exit + '/-1';
            else if (node instanceof ExitNode)
                other_uuid = node.sdfg.sdfg_list_id + '/' +
                    node.parent_id + '/' +
                    node.data.node.scope_entry + '/-1';

            if (other_uuid)
                uuids.push(other_uuid);
        }

        vscode.postMessage({
            type: 'dace.remove_nodes',
            sdfg: JSON.stringify(g),
            uuids: uuids,
        });
    }

    /**
     * Set the correct poisiton for newly added graph elements.
     * This is called as a callback after a new element has been added to the
     * graph and uses a previously stored adding poistion to correctly
     * position the newly added element.
     */
    update_new_element(uuids) {
        if (!this.add_position)
            return;

        let first = uuids[0];

        if (first === 'NONE')
            return;

        let el = daceFindGraphElementByUUID(this.graph, first).element;

        // TODO: set in construction attribute
        this.canvas_manager.translate_element(
            el, { x: el.x, y: el.y }, this.add_position, this.sdfg,
            this.sdfg_list, this.state_parent_list, null, true
        );

        if (el instanceof daceSDFGElements.EntryNode && uuids.length >= 2) {
            let exit = daceFindGraphElementByUUID(this.graph, uuids[1]).element;
            if (exit) {
                this.canvas_manager.translate_element(
                    exit, { x: exit.x, y: exit.y },
                    { x: this.add_position.x, y: this.add_position.y + 100},
                    this.sdfg, this.sdfg_list, this.state_parent_list, null,
                    true
                );
            }
        }

        this.add_position = null;

        this.send_new_sdfg_to_vscode();
    }

    show_no_daemon_dialog() {
        const modal_ret = create_single_use_modal(
            'No DaCe Daemon', false, undefined
        );
        modal_ret.body.append($('<p>', {
            'text': 'You need to open the SDFG Optimization sidepanel to ' +
                'add SDFG elements or edit SDFG properties',
        }));
        modal_ret.modal.modal('show');
    }

    show_select_library_node_dialog(callback) {
        if (!window.sdfg_meta_dict) {
            this.show_no_daemon_dialog();
            return;
        }

        const modal_ret = create_single_use_modal(
            'Select Library Node', true, undefined
        );

        const libraries = window.sdfg_meta_dict['__libs__'];

        const container = $('<div>', {
            'class': 'container-fluid',
        }).appendTo(modal_ret.body);

        const row = $('<div>', {
            'class': 'row',
        }).appendTo(container);

        const header_wrapper = $('<div>', {
            'class': 'col-3',
        }).appendTo(row);
        $('<span>', {
            'text': 'Library:'
        }).appendTo(header_wrapper);

        const lib_input_wrapper = $('<div>', {
            'class': 'col-9',
        }).appendTo(row);
        const lib_input = $('<select>', {
            'id': 'lib-selection-input-list',
            'class': 'sdfv-property-dropdown',
            'style': 'width: 100%;',
            'placeholder': 'Type to search...'
        }).appendTo(lib_input_wrapper);

        Object.keys(libraries).forEach(libname => {
            lib_input.append(new Option(
                libname,
                libraries[libname],
                false,
                false
            ));
        });

        lib_input.editableSelect({
            filter: false,
            effects: 'fade',
            duration: 'fast',
        });

        const background_lib_input = $('#lib-selection-input-list');

        modal_ret.confirm_btn.on('click', () => {
            if (background_lib_input.val()) {
                callback();
                this.add_mode_lib = libraries[background_lib_input.val()];
                modal_ret.modal.modal('hide');
            } else {
                background_lib_input.addClass('is-invalid');
            }
        });

        modal_ret.modal.modal('show');
    }

    clear_selected_items() {
        this.selected_elements = [];
    }

}
