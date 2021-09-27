// Copyright 2020-2021 ETH Zurich and the DaCe-VSCode authors.
// All rights reserved.

import * as $ from 'jquery';
(window as any).jQuery = $;

// JQuery Plugin to allow for editable selects.
import 'jquery-editable-select';
import 'jquery-editable-select/dist/jquery-editable-select.min.css';

import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

import 'material-icons/iconfont/material-icons.css';

import '@spcl/sdfv/sdfv.css';

import './vscode_sdfv.css';

import {
    AccessNode,
    DagreSDFG,
    Edge,
    EntryNode,
    ExitNode,
    find_graph_element_by_uuid,
    find_in_graph,
    GenericSdfgOverlay,
    get_uuid_graph_element,
    MemoryVolumeOverlay,
    mouse_event,
    parse_sdfg,
    RuntimeMicroSecondsOverlay,
    ScopeNode,
    SDFG,
    SDFGElement,
    SDFGNode,
    SDFGRenderer,
    SDFV,
    StaticFlopsOverlay,
    traverse_sdfg_scopes,
} from '@spcl/sdfv/out';
import { JsonTransformation } from '../transformations/transformations';
import { refreshAnalysisPane } from './analysis/analysis';
import {
    BreakpointIndicator,
    refreshBreakpoints,
} from './breakpoints/breakpoints';
import { MessageHandler } from './messaging/message_handler';
import { VSCodeRenderer } from './renderer/vscode_renderer';
import {
    getApplicableTransformations,
    refreshTransformationList,
    sortTransformations,
} from './transformation/transformation';
import { generateAttributesTable } from './utils/attributes_table';
import { reselectRendererElement } from './utils/helpers';

declare const vscode: any;

type CategorizedTransformationList = [
    JsonTransformation[],
    JsonTransformation[],
    JsonTransformation[],
    JsonTransformation[],
];

export class VSCodeSDFV extends SDFV {

    public static readonly DEBUG_DRAW: boolean = false;

    private static readonly INSTANCE: VSCodeSDFV = new VSCodeSDFV();

    private constructor() {
        super();
    }

    public static getInstance(): VSCodeSDFV {
        return this.INSTANCE;
    }

    public static readonly OVERLAYS: {
        [key: string]: typeof GenericSdfgOverlay,
    } = {
        'MemoryVolumeOverlay': MemoryVolumeOverlay,
        'StaticFlopsOverlay': StaticFlopsOverlay,
        'RuntimeMicroSecondsOverlay': RuntimeMicroSecondsOverlay,
        'BreakpointIndicator': BreakpointIndicator,
    };

    private monaco: any | null = null;
    private sdfgString: string | null = null;
    private sdfgMetaDict: { [key: string]: any } | null = null;
    private viewingHistoryState: boolean = false;
    private showingBreakpoints: boolean = false;
    private daemonConnected: boolean = false;
    private transformations: CategorizedTransformationList = [[], [], [], []];
    private selectedTransformation: JsonTransformation | null = null;

    public init_menu(): void {
        this.initInfoBox();
    }

    public close_menu(): void {
        this.clearInfoBox();
    }

    public sidebar_get_contents(): HTMLElement | null {
        return this.infoBoxGetContents();
    }

    public sidebar_show(): void {
        this.infoBoxShow();
    }

    public sidebar_set_title(title: string): void {
        this.infoBoxSetTitle(title);
    }

    public fill_info(elem: SDFGElement): void {
        this.fillInfo(elem);
    }

    public start_find_in_graph(): void {
        this.startFindInGraph();
    }

    public initInfoBox(): void {
        // Pass.
    }

    /**
     * Get the current info-box contents.
     */
    public infoBoxGetContents(): HTMLElement | null {
        return document.getElementById('info-contents');
    }

    /**
     * Show the info box and its necessary components.
     */
    public infoBoxShow(): void {
        $('#info-clear-btn').show();
    }

    /**
     * Set the header/title of the info-box in the embedded view.
     */
    public infoBoxSetTitle(title: string): void {
        $('#info-title').text(title);
    }

    /**
     * Clear the info container and its title, and hide the clear button again.
     */
    public clearInfoBox(): void {
        $('#info-contents').html('');
        $('#info-title').text('');
        $('#info-clear-btn').hide();
        $('#goto-source-btn').hide();
        $('#goto-cpp-btn').hide();
        this.selectedTransformation = null;
        if (vscode)
            vscode.postMessage({
                type: 'transformation_list.deselect',
            });
    }

    public outline(renderer: SDFGRenderer, graph: DagreSDFG): void {
        if (vscode === undefined)
            return;

        const outlineList = [];

        const topLevelSDFG = {
            'icon': 'res:icon-theme/sdfg.svg',
            'type': 'SDFG',
            'label': `SDFG ${renderer.get_sdfg().attributes.name}`,
            'collapsed': false,
            'uuid': get_uuid_graph_element(null),
            'children': [],
        };
        outlineList.push(topLevelSDFG);

        const stack: any[] = [topLevelSDFG];

        traverse_sdfg_scopes(
            graph, (node: SDFGNode, _parent: SDFGElement): boolean => {
                // Skip exit nodes when scopes are known.
                if (node.type().endsWith('Exit') &&
                    node.data.node.scope_entry >= 0) {
                    stack.push(undefined);
                    return true;
                }

                // Create an entry.
                let isCollapsed = node.attributes().is_collapsed;
                isCollapsed = (isCollapsed === undefined) ?
                    false : isCollapsed;
                let nodeLabel = node.label();
                if (node.type() === 'NestedSDFG')
                    nodeLabel = node.data.node.label;

                // If scope has children, remove the name "Entry" from the type.
                let nodeType = node.type();
                if (nodeType.endsWith('Entry')) {
                    const state = node.parent_id !== null ?
                        node.sdfg.nodes[node.parent_id] : null;
                    if (state && state.scope_dict[node.id] !== undefined)
                        nodeType = nodeType.slice(0, -5);
                }

                let icon;
                switch (nodeType) {
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
                    'type': nodeType,
                    'label': nodeLabel,
                    'collapsed': isCollapsed,
                    'uuid': get_uuid_graph_element(node),
                    'children': [],
                });

                // If the node's collapsed we don't traverse any further.
                if (isCollapsed)
                    return false;
                return true;
            }, (_node: SDFGNode, _parent: SDFGElement) => {
                // After scope ends, pop ourselves as the current element and
                // add outselves to the parent.
                const elem = stack.pop();
                const elem_parent = stack[stack.length - 1];
                if (elem !== undefined && elem_parent !== undefined)
                    elem_parent['children'].push(elem);
            }
        );

        vscode.postMessage({
            type: 'outline.set_outline',
            outlineList: outlineList,
        });
    }

    /**
     * Fill out the info-box of the embedded layout with info about an element.
     * This dynamically builds one or more tables showing all of the relevant
     * info about a given element.
     */
    public fillInfo(elem: SDFGElement): void {
        const buttons = [
            $('#goto-source-btn'),
            $('#goto-cpp-btn')
        ];

        // Clear and hide these buttons.
        buttons.forEach((btn) =>{
            btn.hide();
            btn.off('click');
            btn.prop('title', '');
        });
        
        if (elem) {
            this.infoBoxSetTitle(elem.type() + ' ' + elem.label());

            const contents = $('#info-contents');
            contents.html('');
            if (elem instanceof Edge && elem.data.type === 'Memlet' &&
                elem.parent_id !== null) {
                let sdfg_edge = elem.sdfg.nodes[elem.parent_id].edges[elem.id];
                $('<p>', {
                    'class': 'info-subtitle',
                    'html': 'Connectors: ' + sdfg_edge.src_connector +
                        ' <i class="material-icons">arrow_forward</i> ' +
                        sdfg_edge.dst_connector,
                }).appendTo(contents);
                $('<hr>').appendTo(contents);
            }

            generateAttributesTable(elem, undefined, contents);

            if (elem instanceof AccessNode) {
                // If we're processing an access node, add array info too.
                const sdfg_array = elem.sdfg.attributes._arrays[
                    elem.attributes().data
                ];
                $('<br>').appendTo(contents);
                $('<p>', {
                    'class': 'info-subtitle',
                    'text': sdfg_array.type + ' properties:',
                }).appendTo(contents);

                generateAttributesTable(sdfg_array, undefined, contents);
            } else if (elem instanceof ScopeNode) {
                // If we're processing a scope node, we want to append the exit
                // node's props when selecting an entry node, and vice versa.
                let other_element = undefined;

                let other_uuid = undefined;
                if (elem instanceof EntryNode)
                    other_uuid = elem.sdfg.sdfg_list_id + '/' +
                        elem.parent_id + '/' +
                        elem.data.node.scope_exit + '/-1';
                else if (elem instanceof ExitNode)
                    other_uuid = elem.sdfg.sdfg_list_id + '/' +
                        elem.parent_id + '/' +
                        elem.data.node.scope_entry + '/-1';

                if (other_uuid) {
                    const ret_other_elem = find_graph_element_by_uuid(
                        VSCodeRenderer.getInstance()?.get_graph(),
                        other_uuid
                    );
                    other_element = ret_other_elem.element;
                }

                if (other_element) {
                    $('<br>').appendTo(contents);
                    $('<p>', {
                        'class': 'info-subtitle',
                        'text':
                            other_element.type() + ' ' + other_element.label(),
                    }).appendTo(contents);

                    generateAttributesTable(other_element, undefined, contents);
                }
            }

            $('#info-clear-btn').show();
        } else {
            this.clearInfoBox();
        }
    }

    public startFindInGraph(): void {
        const renderer = VSCodeRenderer.getInstance();
        if (renderer)
            setTimeout(() => {
                const searchVal = $('#search').val();
                const graph = renderer.get_graph();
                if (graph && searchVal !== undefined &&
                    typeof searchVal === 'string' && searchVal.length > 0)
                    find_in_graph(
                        this, renderer, graph, searchVal,
                        $('#search-case-sensitive-btn').is(':checked')
                    );
            }, 1);
    }

    public refreshSdfg(): void {
        if (vscode)
            vscode.postMessage({
                type: 'sdfv.get_current_sdfg',
            });
    }

    public setRendererContent(
        sdfgString: string, previewing: boolean = false,
        preventRefreshes: boolean = false
    ): void {
        const parsedSdfg = parse_sdfg(sdfgString);
        let renderer = VSCodeRenderer.getInstance();

        if (renderer) {
            renderer.set_sdfg(parsedSdfg);
        } else {
            const contentsElem = document.getElementById('contents');
            if (contentsElem === null) {
                console.error('Could not find element to attach renderer to');
                return;
            }

            if (parsedSdfg !== null)
                renderer = VSCodeRenderer.init(
                    parsedSdfg, contentsElem,
                    mouse_event, null, VSCodeSDFV.DEBUG_DRAW, null, null
                );
            else
                return;
        }

        if (!previewing) {
            this.sdfgString = sdfgString;
            if (!preventRefreshes)
                getApplicableTransformations();
        }

        const graph = renderer.get_graph();
        if (graph)
            this.outline(renderer, graph);
        refreshAnalysisPane();
        refreshBreakpoints();

        const selectedElements = renderer.get_selected_elements();
        if (selectedElements && selectedElements.length === 1)
            reselectRendererElement(selectedElements[0]);
        else if (!selectedElements || selectedElements.length === 0)
            this.fillInfo(
                new SDFG(renderer.get_sdfg())
            );

        vscode.postMessage({
            type: 'sdfv.process_queued_messages',
            sdfgName: renderer.get_sdfg().attributes.name,
        });
    }

    public resetRendererContent(): void {
        if (!this.sdfgString)
            return;

        let userTransform = null;
        let renderer = VSCodeRenderer.getInstance();
        if (renderer) {
            userTransform = renderer.get_canvas_manager()?.get_user_transform();
            renderer.destroy();
        }

        const parsedSdfg = parse_sdfg(this.sdfgString);
        if (parsedSdfg !== null) {
            const contentsElem = document.getElementById('contents');
            if (contentsElem === null) {
                console.error('Could not find element to attach renderer to');
                return;
            }

            renderer = VSCodeRenderer.init(
                parsedSdfg, contentsElem, mouse_event, userTransform,
                VSCodeSDFV.DEBUG_DRAW, null, null
            );
        }

        const graph = renderer?.get_graph();
        if (renderer && graph) {
            this.outline(renderer, graph);
            refreshAnalysisPane();
            refreshBreakpoints();
        }
    }

    /*
     * Send a request to the extension to jump to a specific source code file
     * and location, if it exists.
     */
    public gotoSource(
        filePath: string, startRow: number, startChar: number, endRow: number,
        endChar: number
    ): void {
        vscode.postMessage({
            type: 'sdfv.go_to_source',
            filePath: filePath,
            startRow: startRow,
            startChar: startChar,
            endRow: endRow,
            endChar: endChar,
        });
    }

    /*
     * Send a request to the extension to jump to the generated code location of
     * the current Node.
     */
    public gotoCpp(
        sdfgName: string, sdfgId: number, stateId: number, nodeId: number
    ): void {
        vscode.postMessage({
            type: 'sdfv.go_to_cpp',
            sdfgName: sdfgName,
            sdfgId: sdfgId,
            stateId: stateId,
            nodeId: nodeId
        });
    }

    public toggleBreakpoints(): void {
        this.setShowingBreakpoints(!this.showingBreakpoints);
    }

    public getMonaco(): any | null {
        return this.monaco;
    }

    public getSdfgString(): string | null {
        return this.sdfgString;
    }

    public getMetaDict(): { [key: string]: any } | null {
        return this.sdfgMetaDict;
    }

    public getViewingHistoryState(): boolean {
        return this.viewingHistoryState;
    }

    public getShowingBreakpoints(): boolean {
        return this.showingBreakpoints;
    }

    public getDaemonConnected(): boolean {
        return this.daemonConnected;
    }

    public getTransformations(): CategorizedTransformationList {
        return this.transformations;
    }

    public getSelectedTransformation(): JsonTransformation | null {
        return this.selectedTransformation;
    }

    public setMonaco(monaco: any | null): void {
        this.monaco = monaco;
    }

    public setSdfgString(sdfgString: string | null): void {
        this.sdfgString = sdfgString;
    }

    public setMetaDict(sdfgMetaDict: { [key: string]: any } | null): void {
        this.sdfgMetaDict = sdfgMetaDict;
    }

    public setViewingHistoryState(viewingHistoryState: boolean): void {
        this.viewingHistoryState = viewingHistoryState;
    }

    public setShowingBreakpoints(showingBreakpoints: boolean): void {
        this.showingBreakpoints = showingBreakpoints;
        const alreadyActive =
            VSCodeRenderer.getInstance()?.get_overlay_manager().get_overlay(
                BreakpointIndicator
            );
        if (this.showingBreakpoints && alreadyActive === undefined) {
            vscode.postMessage({
                type: 'sdfv.register_breakpointindicator',
            });
            $('#display-bps').html('Hide Breakpoints');
        } else if (!this.showingBreakpoints) {
            vscode.postMessage({
                type: 'sdfv.deregister_breakpointindicator',
            });
            $('#display-bps').html('Display Breakpoints');
        }
    }

    public setDaemonConnected(daemonConnected: boolean): void {
        this.daemonConnected = daemonConnected;
        VSCodeRenderer.getInstance()?.setDaemonConnected(daemonConnected);
    }

    public setTransformations(
        transformations: CategorizedTransformationList
    ): void {
        this.transformations = transformations;
    }

    public setSelectedTransformation(
        selectedTransformation: JsonTransformation | null
    ): void {
        this.selectedTransformation = selectedTransformation;
    }

}

export function vscodeHandleEvent(event: string, data: any): void {
    switch (event) {
        case 'remove_graph_nodes':
            if (data && data.nodes)
                VSCodeRenderer.getInstance()?.removeGraphNodes(data.nodes);
            break;
        case 'add_graph_node':
            if (data && data.type !== undefined && data.parent !== undefined &&
                data.edgeA !== undefined)
                VSCodeRenderer.getInstance()?.addNodeToGraph(
                    data.type, data.parent, data.edgeA
                );
            break;
        case 'libnode_select':
            if (data && data.callback)
                VSCodeRenderer.getInstance()?.showSelectLibraryNodeDialog(
                    data.callback
                );
            break;
        case 'warn_no_daemon':
            VSCodeRenderer.getInstance()?.showNoDaemonDialog();
            break;
        case 'active_overlays_changed':
            refreshAnalysisPane();
            break;
        case 'exit_preview':
            VSCodeSDFV.getInstance().setViewingHistoryState(false);
            break;
        case 'collapse_state_changed':
        case 'position_changed':
            VSCodeRenderer.getInstance()?.sendNewSdfgToVscode();
            break;
        case 'renderer_selection_changed':
            if (data && data.multi_selection_changed)
                getApplicableTransformations();
            else
                sortTransformations(refreshTransformationList, true);
            break;
    }
}

$(() => {
    $('#processing-overlay').hide();
    vscode.postMessage({
        type: 'sdfv.get_current_sdfg',
    });

    $('#search-case-sensitive-btn').on('click', function () {
        const caseBtn = $('#search-case-sensitive-btn');
        if (caseBtn) {
            if (caseBtn)
            if (caseBtn.css('background-color') === 'transparent') {
                caseBtn.css('background-color', '#245779');
                caseBtn.prop('checked', true);
            } else {
                caseBtn.css('background-color', 'transparent');
                caseBtn.prop('checked', false);
            }
        }

        VSCodeSDFV.getInstance().startFindInGraph();
    });

    $('#search').on('input', function (e) {
        VSCodeSDFV.getInstance().startFindInGraph();
    });

    $('#breakpoint-btn').on('click', () => {
        VSCodeSDFV.getInstance().toggleBreakpoints();
    });

    $('#info-clear-btn').on('click', () => {
        VSCodeSDFV.getInstance().clearInfoBox();
    });

    window.addEventListener('message', (e) => {
        MessageHandler.getInstance().handleMessage(e.data);
    });

    document.body.onresize = () => {
        const renderer = VSCodeRenderer.getInstance();
        if (renderer) {
            renderer.onresize();
            renderer.draw_async();
        }
    };

    $('body').show();
});