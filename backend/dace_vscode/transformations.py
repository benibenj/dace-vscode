# Copyright 2020-2021 ETH Zurich and the DaCe-VSCode authors.
# All rights reserved.

from dace import nodes, serialize
from dace.transformation.transformation import SubgraphTransformation
from dace_vscode import utils
import sys
import traceback

def expand_library_node(json_in):
    """
    Expand a specific library node in a given SDFG. If no specific library node
    is provided, expand all library nodes in the given SDFG.
    :param json_in:  The entire provided request JSON.
    """
    old_meta = utils.disable_save_metadata()

    sdfg = None
    try:
        loaded = utils.load_sdfg_from_json(json_in['sdfg'])
        if loaded['error'] is not None:
            return loaded['error']
        sdfg = loaded['sdfg']
    except KeyError:
        return {
            'error': {
                'message': 'Failed to expand library node',
                'details': 'No SDFG provided',
            },
        }

    try:
        sdfg_id, state_id, node_id = json_in['nodeid']
    except KeyError:
        sdfg_id, state_id, node_id = None, None, None

    if sdfg_id is None:
        sdfg.expand_library_nodes()
    else:
        context_sdfg = sdfg.sdfg_list[sdfg_id]
        state = context_sdfg.node(state_id)
        node = state.node(node_id)
        if isinstance(node, nodes.LibraryNode):
            node.expand(context_sdfg, state)
        else:
            return {
                'error': {
                    'message': 'Failed to expand library node',
                    'details': 'The provided node is not a valid library node',
                },
            }

    new_sdfg = sdfg.to_json()
    utils.restore_save_metadata(old_meta)
    return {
        'sdfg': new_sdfg,
    }


def reapply_history_until(sdfg_json, index):
    """
    Rewind a given SDFG back to a specific point in its history by reapplying
    all transformations until a given index in its history to its original
    state.
    :param sdfg_json:  The SDFG to rewind.
    :param index:      Index of the last history item to apply.
    """
    old_meta = utils.disable_save_metadata()

    loaded = utils.load_sdfg_from_json(sdfg_json)
    if loaded['error'] is not None:
        return loaded['error']
    sdfg = loaded['sdfg']

    original_sdfg = sdfg.orig_sdfg
    history = sdfg.transformation_hist

    for i in range(index + 1):
        transformation = history[i]
        try:
            if isinstance(transformation, SubgraphTransformation):
                transformation.apply(
                    original_sdfg.sdfg_list[transformation.sdfg_id]
                )
            else:
                transformation.apply_pattern(
                    original_sdfg.sdfg_list[transformation.sdfg_id]
                )
        except Exception as e:
            print(traceback.format_exc(), file=sys.stderr)
            sys.stderr.flush()
            return {
                'error': {
                    'message':
                    'Failed to play back the transformation history',
                    'details': utils.get_exception_message(e),
                },
            }

    new_sdfg = original_sdfg.to_json()
    utils.restore_save_metadata(old_meta)
    return {
        'sdfg': new_sdfg,
    }


def apply_transformation(sdfg_json, transformation_json):
    old_meta = utils.disable_save_metadata()

    loaded = utils.load_sdfg_from_json(sdfg_json)
    if loaded['error'] is not None:
        return loaded['error']
    sdfg = loaded['sdfg']

    try:
        transformation = serialize.from_json(transformation_json)
    except Exception as e:
        print(traceback.format_exc(), file=sys.stderr)
        sys.stderr.flush()
        return {
            'error': {
                'message': 'Failed to parse the applied transformation',
                'details': utils.get_exception_message(e),
            },
        }
    try:
        target_sdfg = sdfg.sdfg_list[transformation.sdfg_id]
        if isinstance(transformation, SubgraphTransformation):
            sdfg.append_transformation(transformation)
            transformation.apply(target_sdfg)
        else:
            transformation.apply_pattern(target_sdfg)
    except Exception as e:
        print(traceback.format_exc(), file=sys.stderr)
        sys.stderr.flush()
        return {
            'error': {
                'message': 'Failed to apply the transformation to the SDFG',
                'details': utils.get_exception_message(e),
            },
        }

    new_sdfg = sdfg.to_json()
    utils.restore_save_metadata(old_meta)
    return {
        'sdfg': new_sdfg,
    }


def get_transformations(sdfg_json, selected_elements):
    # We lazy import DaCe, not to break cyclic imports, but to avoid any large
    # delays when booting in daemon mode.
    from dace.transformation.optimizer import SDFGOptimizer
    from dace.sdfg.graph import SubgraphView

    old_meta = utils.disable_save_metadata()

    loaded = utils.load_sdfg_from_json(sdfg_json)
    if loaded['error'] is not None:
        return loaded['error']
    sdfg = loaded['sdfg']

    optimizer = SDFGOptimizer(sdfg)
    matches = optimizer.get_pattern_matches()

    transformations = []
    docstrings = {}
    for transformation in matches:
        transformations.append(transformation.to_json())
        docstrings[type(transformation).__name__] = transformation.__doc__

    selected_states = [
        utils.sdfg_find_state_from_element(sdfg, n) for n in selected_elements
        if n['type'] == 'state'
    ]
    selected_nodes = [
        utils.sdfg_find_node_from_element(sdfg, n) for n in selected_elements
        if n['type'] == 'node'
    ]
    selected_sdfg_ids = list(set(elem['sdfg_id'] for elem in selected_elements))
    selected_sdfg = sdfg
    if len(selected_sdfg_ids) > 1:
        return {
            'transformations': transformations,
            'docstrings': docstrings,
            'warnings': 'More than one SDFG selected, ignoring subgraph',
        }
    elif len(selected_sdfg_ids) == 1:
        selected_sdfg = sdfg.sdfg_list[selected_sdfg_ids[0]]

    subgraph = None
    if len(selected_states) > 0:
        subgraph = SubgraphView(selected_sdfg, selected_states)
    else:
        violated = False
        state = None
        for node in selected_nodes:
            if state is None:
                state = node.state
            elif state != node.state:
                violated = True
                break
        if not violated and state is not None:
            subgraph = SubgraphView(state, selected_nodes)

    if subgraph is not None:
        extensions = SubgraphTransformation.extensions()
        for xform in extensions:
            xform_data = extensions[xform]
            if ('singlestate' in xform_data and
                xform_data['singlestate'] and
                len(selected_states) > 0):
                continue
            xform_obj = xform(subgraph)
            if xform_obj.can_be_applied(selected_sdfg, subgraph):
                transformations.append(xform_obj.to_json())
                docstrings[xform.__name__] = xform_obj.__doc__

    utils.restore_save_metadata(old_meta)
    return {
        'transformations': transformations,
        'docstrings': docstrings,
    }
