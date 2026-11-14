import assert from 'node:assert/strict';
import {createElement} from 'react';
import {act,create} from 'react-test-renderer';
import PlanComparison from '../src/components/PlanComparison';
const input={outwardMinutes:10,returnMinutes:10,budgetMinutes:50,oxygenMinutes:90,reserveMinutes:10,oxygenReserveMinutes:15,tasks:[{id:'a',title:'Photo',fraction:.2,minutes:5,priority:1,done:false},{id:'b',title:'Sample',fraction:.8,minutes:10,priority:5,done:false}]};
const ui=create(createElement(PlanComparison,{input}));const cards=()=>ui.root.findAllByType('article');const originalReturn=cards()[0].findAllByType('strong').map(s=>s.children.join(''));
act(()=>ui.root.findByProps({'aria-label':'Extra investigation'}).props.onChange({target:{value:'10'}}));assert.deepEqual(cards()[0].findAllByType('strong').map(s=>s.children.join('')),originalReturn);assert.equal(cards()[1].findAllByProps({className:'omitted'}).length,1);assert.equal(cards()[0].findAllByProps({className:'omitted'}).length,0);
act(()=>ui.root.findByProps({'aria-label':'Comparison walking pace'}).props.onChange({target:{value:'.7'}}));assert.deepEqual(cards()[0].findAllByType('strong').map(s=>s.children.join('')),originalReturn);act(()=>ui.unmount());console.log('PASS original plan stays fixed while dropdowns change adjusted travel and task selection');
