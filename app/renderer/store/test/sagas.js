/*
 * Copyright (C) 2015-2018 CloudBeat Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { all, put, select, takeLatest, call } from 'redux-saga/effects';
import { getBrowsersTarget, getDevicesTarget, findDefaultBrowserKey, findDefaultDeviceKey } from '../../helpers/cloudProviders';
import { success, failure } from '../../helpers/redux';
import * as testActions from './actions';
import * as wbActions from '../workbench/actions';
import * as editorActions from '../editor/actions';
import * as tabActions from '../tabs/actions';
import * as loggerActions from '../logger/actions';
import ActionTypes from '../types';
import { MAIN_SERVICE_EVENT } from '../../services/MainIpc';
import ServicesSingleton from '../../services';
const services = ServicesSingleton();
const LOCAL_TEST_PROVIDER = 'Local';
/**
 * Test Sagas
 */
export default function* root() {
    yield all([
        takeLatest(ActionTypes.TEST_START, startTest),
        takeLatest(ActionTypes.TEST_REPL_START, startReplStart),
        takeLatest(ActionTypes.TEST_START_ALL, startTestAll),
        takeLatest(ActionTypes.TEST_STOP, stopTest),
        takeLatest(ActionTypes.TEST_CONTINUE, continueTest),
        takeLatest(MAIN_SERVICE_EVENT, handleServiceEvents),
        takeLatest(ActionTypes.TEST_EVENT_LINE_UPDATE, handleOnLineUpdate),
        takeLatest(ActionTypes.TEST_SET_PROVIDER, setTestProvider),
        takeLatest(ActionTypes.TEST_SET_MODE, setTestMode),
        takeLatest(ActionTypes.TEST_REPL_CLOSE, replClose),
        takeLatest(ActionTypes.TEST_REPL_SEND, replSend),
         
    ]);
}

function* setTestProvider({payload}) {
    const testProvider = payload.value;
    if (testProvider === 'Local') {
        // local
        yield put(testActions.setTestMode('web'));
    } else {
        // cloud
        const testProviders = yield select(state => state.settings.cloudProvidesBrowsersAndDevices);

        if (testProviders && testProviders[testProvider]) {
            const providerData = testProviders[testProvider];
            if (providerData && providerData.browsersTree && Array.isArray(providerData.browsersTree) && providerData.browsersTree.length > 0) {
                yield put(testActions.setTestMode('web'));
            } else if (providerData && providerData.devicesTree && Array.isArray(providerData.devicesTree) && providerData.devicesTree.length > 0) {
                yield put(testActions.setTestMode('mob'));
            }
        }        
    }
}

function* setTestMode({payload}) {
    const { value } = payload;
    const testMode = value;
    const testProvider = yield select(state => state.test.runtimeSettings.testProvider);
    if (typeof testProvider !== 'undefined' && testProvider === '') {
        // local
        if (testMode === 'web') {
            const browsers = yield select(state => state.test.browsers);
            if (browsers && Array.isArray(browsers) && browsers.length > 0) {
                yield put(testActions.setTestTarget(browsers[0].id));
            }
        }
    } else {
        if (testMode && testProvider) {
            // cloud
            const testProviders = yield select(state => state.settings.cloudProvidesBrowsersAndDevices);
            if (testProviders && testProviders[testProvider]) {
                const providerData = testProviders[testProvider];
                if (testMode === 'web' && providerData.browsersTree && Array.isArray(providerData.browsersTree) && providerData.browsersTree.length > 0) {
                    const browserKey = findDefaultBrowserKey(providerData.browsersTree);
                    if (browserKey) {
                        const target = getBrowsersTarget(providerData.browsersTree, browserKey);
                        if (target) {
                            yield put(testActions.setTestTarget(target));
                        }
                    }
                }
                
                if (testMode === 'mob' && providerData.devicesTree && Array.isArray(providerData.devicesTree) && providerData.devicesTree.length > 0) {
                    const deviceKey = findDefaultDeviceKey(providerData.devicesTree);
                    if (providerData && providerData.devicesTree) {
                        const target = getDevicesTarget(providerData.devicesTree, deviceKey);
                        if (target) {
                            yield put(testActions.setTestTarget(target));
                        }
                    }
                }
            }      
        }
    }
    
    yield deviceDiscoveryServiceSaveStart();
}

export function* handleServiceEvents({ payload }) {
    const { service, event } = payload;
    if (!event) {
        return;
    }
    if (service === 'SeleniumService') {
        yield handleSeleniumServiceEvent(event);
    }
    else if (service === 'DeviceDiscoveryService') {
        yield handleDeviceDiscoveryServiceEvent(event);
    }
    else if (service === 'TestRunnerService') {
        yield handleTestRunnerServiceEvent(event);
    }    
}

function* deviceDiscoveryServiceSaveStart() {
    const testMode = yield select(state => state.test.runtimeSettings.testMode);
    const testProvider = yield select(state => state.test.runtimeSettings.testProvider);

    // list local devices only if we are using a local test provider
    // we do not need to list the local devices, if using a remote cloud provider
    if (testMode === 'mob' && testProvider === LOCAL_TEST_PROVIDER) {
        // start Android and iOS device watcher
        services.mainIpc.call('DeviceDiscoveryService', 'start').catch((e) => console.error(e.message));
    }
}

function checkFileNameForUpperLoverCases (filename, rootPath) {
    if (filename.startsWith(rootPath)) {
        //ignore, all is ok
        return filename;
    } else {
        const filenameUpperCase = filename.toUpperCase();

        if (filenameUpperCase.startsWith(rootPath.toUpperCase())) {
            const substring = filename.substring(rootPath.length);
            return rootPath+substring;
        } else {
            return filename;
        }
    }
}

function* handleTestRunnerServiceEvent(event) {
    const rootPath = yield select(state => state.fs.rootPath);
    if (event.type === 'LOG_ENTRY') {
        yield put(loggerActions.addLog(event.message, event.severity, 'general'));
    }
    else if (event.type === 'TEST_ENDED') {
        yield put(testActions.onTestEnded());

        const { active } = yield select(state => state.logger);

        if (active && active === 'variables') {
            yield put(loggerActions.setActiveLogger('general'));
        }

        if (event && event.result && event.result.status) {
            if ( event.result.status ==='passed') {
                yield put(editorActions.resetActiveLines());
            }
            
            let duration = 0;

            if (event.result.duration) {
                duration = event.result.duration;
            }
            
            const summary = {
                _duration: duration,
                _status: event.result.status
            };
            
            yield all([
                call(services.mainIpc.call, 'AnalyticsService', 'playStop', [summary]),
                deviceDiscoveryServiceSaveStart()
            ]);
        } else if (event && event.error) {
            let message = 'Error: ';
            const error = event.error;

            if (error.message) {
                message += error.message;
            }
            
            if (error.code) {
                message += ' code: '+error.code;
            }
            if (error.column) {
                message += ' column: '+error.column;
            }

            yield put(loggerActions.addLog(message, null, 'general'));
            yield deviceDiscoveryServiceSaveStart();
        }
    }
    else if (event.type === 'LINE_UPDATE') {
        const resolvedFileName = checkFileNameForUpperLoverCases(event.file, rootPath);
        yield put(testActions.onLineUpdate(event.time, resolvedFileName, event.line, event.primary));
    }
    else if (event.type === 'BREAKPOINT') {
        const resolvedFileName = checkFileNameForUpperLoverCases(event.file, rootPath);
        yield put(testActions.onBreakpoint(resolvedFileName, event.line, event.variables || []));
    }
    else if (event.type === 'BREAKPOIN_DEACTIVATE') {
        const resolvedFileName = checkFileNameForUpperLoverCases(event.file, rootPath);
        yield put(testActions.onDisabledBreakpoint(resolvedFileName, event.line));
    }
    else if (event.type === 'BREAKPOIN_RESOLVED') {
        const resolvedFileName = checkFileNameForUpperLoverCases(event.file, rootPath);
        yield put(testActions.onResolvedBreakpoint(resolvedFileName, event.line));
    }
    else if (event.type === 'SEND_START_DATA') {
        yield call(services.mainIpc.call, 'AnalyticsService', 'playStart', [event.data]);
    }
    else if (event.type === 'REPL_START') {
        yield put(testActions.onReplStarted(event.message));
    }
    else if (event.type === 'REPL_RESULT') {
        if (event.message) {
            yield put(testActions.onReplResult(event.message));
        } else {
            yield put(testActions.onReplResult('undefined'));
        }
    }
    else if (event.type === 'REPL_CAN_START') {
        yield put(testActions.replCanStart(event.value));
    }
}

function* handleSeleniumServiceEvent(event) {
    if (event.type === 'SELENIUM_STARTED') {
        yield put(testActions.setSeleniumReady(true));
        const { port = null, browserTimeout = null, timeout = null } = event;
        if (port) {
            yield put(testActions.setSeleniumPort(port));
        }        
        if (browserTimeout) {
            yield put(testActions.setSeleniumBrowserTimeout(browserTimeout));
        }
        if (timeout) {
            yield put(testActions.setSeleniumTimeout(timeout));
        }
    }
    else if (event.type === 'SELENIUM_STOPPED') {
        yield put(testActions.setSeleniumReady(false));
    }
    else if (event.type === 'LOG_ENTRY') {
        yield put(loggerActions.addLog(event.message, event.severity, 'selenium'));
    }
}

function* handleDeviceDiscoveryServiceEvent(event) {
    if (event.type === 'DEVICE_CONNECTED') {
        yield put(testActions.addDevice(event.device));
    }
    else if (event.type === 'DEVICE_DISCONNECTED') {
        yield put(testActions.removeDevice(event.device));
    } else if (event.type === 'XCODE_ERROR') {
        yield put(wbActions.setXCodeError());
    } else if (event.type === 'ANDROID_HOME_ERROR') {
        yield put(wbActions.setAndroidHomeError());
    }
}

export function* runItem(itemsLength, browsersList, inputCurrentItem, saveMainFile, breakpoints, runtimeSettingsClone, runSettings) {
    let currentItem = inputCurrentItem;
    
    if (currentItem < itemsLength) {
        const browser = browsersList[currentItem];        
        const testBrowser = {
            browserName: browser._apiName,
            browserVersion: browser._version,
            osName: browser._osName,
            osVersion: browser._osVersion
        };

        runtimeSettingsClone.testTarget = testBrowser;
        yield call(services.mainIpc.call, 'TestRunnerService', 'start', [ saveMainFile, breakpoints, runtimeSettingsClone, runSettings ]);
        currentItem++;
        yield runItem(itemsLength, browsersList, currentItem, saveMainFile, breakpoints, runtimeSettingsClone, runSettings);
    } else {
        return;
    }
}

export function* startTestAll({ payload }) {
    let currentItem = 0;
    const { breakpoints, runtimeSettings } = yield select(state => state.test);
    const { cloudProvidesBrowsersAndDevices } = yield select(state => state.settings);
    const { runSettings, generalSettings } = yield select(state => state.settings);

    const editor = yield select(state => state.editor);

    let file;
    let saveMainFile;

    if (editor && editor.activeFile) {
        file = yield select(state => state.fs.files[editor.activeFile]);
        saveMainFile = editor.activeFile;
    }

    if (!file) {
        yield put({
            type: failure(ActionTypes.TEST_START),
            payload: { error: { type: ActionTypes.TEST_ERR_MAIN_SCRIPT_NOT_SELECTED } },
        });
        return;
    }
    // check if file content exist (e.g. was pre-loaded from the file)
    else if (!file.hasOwnProperty('content') || typeof(file.content) !== 'string') {
        return;     // silently ignore it
    } 
    else if (file.content.trim().length == 0) {
        yield put({
            type: failure(ActionTypes.TEST_START),
            payload: { error: { type: ActionTypes.TEST_ERR_MAIN_SCRIPT_IS_EMPTY } },
        });
        return;
    }
    else if (file.modified) {
        yield put(wbActions.saveCurrentFile());
    }
    // clone runtime settings and add cloud provider information, if a provider was selected
    const runtimeSettingsClone = {
        ...runtimeSettings,
        ...generalSettings
    };

    if (file && file.ext && file.ext === '.feature') {
        runtimeSettingsClone.framework = 'cucumber';
    }

    // add test provider information
    if (runtimeSettings.testProvider) {
        const cloudProviders = yield select(state => state.settings.cloudProviders);
        runtimeSettingsClone.testProvider = cloudProviders.hasOwnProperty(runtimeSettings.testProvider) ? { ...cloudProviders[runtimeSettings.testProvider], id: runtimeSettings.testProvider } : null;
    }
    // add device information 
    if (runtimeSettings.testTarget && runtimeSettings.testMode === 'mob') {
        const devices = yield select(state => state.test.devices);
        const targetDevice = devices.find(x => x.id === runtimeSettings.testTarget);
        if (targetDevice) {
            runtimeSettingsClone.testTarget = targetDevice;
        }
    }

    const rootPath = yield select(state => state.fs.rootPath);
    if (rootPath && typeof rootPath === 'string') {
        runtimeSettingsClone.rootPath = rootPath;
    }

    const fsTree = yield select(state => state.fs.tree);

    if (fsTree && fsTree.data && Array.isArray(fsTree.data) && fsTree.data.length > 0) {
        
        const OXYGEN_CONFIG_FILE_NAME = 'oxygen.conf';
        const OXYGEN_ENV_FILE_NAME = 'oxygen.env';
        const OXYGEN_PAGE_OBJECT_FILE_NAME = 'oxygen.po';

        let oxConfigFile = null;
        let oxEnvFile = null;
        let oxPageObjectFile = null;

        fsTree.data.map((item) => {
            if (
                item && 
                item.type && 
                item.type === 'file' && 
                ['.js', '.json'].includes(item.ext) && 
                item.path && 
                typeof item.path === 'string' && 
                item.name && 
                typeof item.name === 'string'
            ) {
                if (item.name.startsWith(OXYGEN_CONFIG_FILE_NAME)) {
                    oxConfigFile = item.path;
                }
                if (item.name.startsWith(OXYGEN_ENV_FILE_NAME)) {
                    oxEnvFile = item.path;
                }
                if (item.name.startsWith(OXYGEN_PAGE_OBJECT_FILE_NAME)) {
                    oxPageObjectFile = item.path;
                }
            }
        });

        if (oxConfigFile) {
            runtimeSettingsClone.oxConfigFile = oxConfigFile;
        }
        if (oxEnvFile) {
            runtimeSettingsClone.oxEnvFile = oxEnvFile;
        }
        if (oxConfigFile) {
            runtimeSettingsClone.oxPageObjectFile = oxPageObjectFile;
        }
    }

    try {        
        // reset active line cursor in all editors
        yield put(editorActions.resetActiveLines());
        // reset General log
        yield put(loggerActions.resetGeneralLogs());
        // call TestRunner service to start the test
        
        
        yield put(testActions.waitUpdateBreakpoints(false));
        yield call(services.mainIpc.call, 'DeviceDiscoveryService', 'stop', []);

        if (
            runtimeSettings.testProvider &&
            cloudProvidesBrowsersAndDevices &&
            cloudProvidesBrowsersAndDevices[runtimeSettings.testProvider]
        ) {
            const providerData = cloudProvidesBrowsersAndDevices[runtimeSettings.testProvider];

            if (
                providerData && 
                providerData.browsersList && 
                Array.isArray(providerData.browsersList) &&
                providerData.browsersList.length > 0
            ) {
                const itemsLength = providerData.browsersList.length;
                yield runItem(itemsLength, providerData.browsersList, currentItem, saveMainFile, breakpoints, runtimeSettingsClone, runSettings);            
            }
        }

        yield put({
            type: success(ActionTypes.TEST_START),
            payload: null,
        });
    }
    catch (err) {
        /* istanbul ignore next */
        yield put({
            type: failure(ActionTypes.TEST_START),
            payload: { error: err },
        });
    }
}

export function* startTest({ payload }) {
    const { breakpoints, runtimeSettings } = yield select(state => state.test);
    const { runSettings, generalSettings } = yield select(state => state.settings);

    const editor = yield select(state => state.editor);

    let file;
    let saveMainFile;

    if (editor && editor.activeFile) {
        file = yield select(state => state.fs.files[editor.activeFile]);
        saveMainFile = editor.activeFile;
    }

    if (!file) {
        yield put({
            type: failure(ActionTypes.TEST_START),
            payload: { error: { type: ActionTypes.TEST_ERR_MAIN_SCRIPT_NOT_SELECTED } },
        });
        return;
    }
    // check if file content exist (e.g. was pre-loaded from the file)
    else if (!file.hasOwnProperty('content') || typeof(file.content) !== 'string') {
        return;     // silently ignore it
    } 
    else if (file.content.trim().length == 0) {
        yield put({
            type: failure(ActionTypes.TEST_START),
            payload: { error: { type: ActionTypes.TEST_ERR_MAIN_SCRIPT_IS_EMPTY } },
        });
        return;
    }
    else if (file.modified) {
        yield put(wbActions.saveCurrentFile());
    }
    // clone runtime settings and add cloud provider information, if a provider was selected
    const runtimeSettingsClone = {
        ...runtimeSettings,
        ...generalSettings
    };

    if (file && file.ext && file.ext === '.feature') {
        runtimeSettingsClone.framework = 'cucumber';
    }

    // add test provider information
    if (runtimeSettings.testProvider) {
        const cloudProviders = yield select(state => state.settings.cloudProviders);
        runtimeSettingsClone.testProvider = cloudProviders.hasOwnProperty(runtimeSettings.testProvider) ? { ...cloudProviders[runtimeSettings.testProvider], id: runtimeSettings.testProvider } : null;
    }
    // add device information 
    if (runtimeSettings.testTarget && runtimeSettings.testMode === 'mob') {
        const devices = yield select(state => state.test.devices);
        const targetDevice = devices.find(x => x.id === runtimeSettings.testTarget);
        if (targetDevice) {
            runtimeSettingsClone.testTarget = targetDevice;
        }
    }

    const rootPath = yield select(state => state.fs.rootPath);
    if (rootPath && typeof rootPath === 'string') {
        runtimeSettingsClone.rootPath = rootPath;
    }

    const fsTree = yield select(state => state.fs.tree);

    if (fsTree && fsTree.data && Array.isArray(fsTree.data) && fsTree.data.length > 0) {
        
        const OXYGEN_CONFIG_FILE_NAME = 'oxygen.conf';
        const OXYGEN_ENV_FILE_NAME = 'oxygen.env';
        const OXYGEN_PAGE_OBJECT_FILE_NAME = 'oxygen.po';

        let oxConfigFile = null;
        let oxEnvFile = null;
        let oxPageObjectFile = null;

        fsTree.data.map((item) => {
            if (
                item && 
                item.type && 
                item.type === 'file' && 
                ['.js', '.json'].includes(item.ext) && 
                item.path && 
                typeof item.path === 'string' && 
                item.name && 
                typeof item.name === 'string'
            ) {
                if (item.name.startsWith(OXYGEN_CONFIG_FILE_NAME)) {
                    oxConfigFile = item.path;
                }
                if (item.name.startsWith(OXYGEN_ENV_FILE_NAME)) {
                    oxEnvFile = item.path;
                }
                if (item.name.startsWith(OXYGEN_PAGE_OBJECT_FILE_NAME)) {
                    oxPageObjectFile = item.path;
                }
            }
        });

        if (oxConfigFile) {
            runtimeSettingsClone.oxConfigFile = oxConfigFile;
        }
        if (oxEnvFile) {
            runtimeSettingsClone.oxEnvFile = oxEnvFile;
        }
        if (oxConfigFile) {
            runtimeSettingsClone.oxPageObjectFile = oxPageObjectFile;
        }
    }

    try {        
        // reset active line cursor in all editors
        yield put(editorActions.resetActiveLines());
        // reset General log
        yield put(loggerActions.resetGeneralLogs());
        // call TestRunner service to start the test
        
        
        yield put(testActions.waitUpdateBreakpoints(false));
        yield call(services.mainIpc.call, 'DeviceDiscoveryService', 'stop', []);
        yield call(services.mainIpc.call, 'TestRunnerService', 'start', [ saveMainFile, breakpoints, runtimeSettingsClone, runSettings ]);        
        yield put({
            type: success(ActionTypes.TEST_START),
            payload: null,
        });
    }
    catch (err) {
        /* istanbul ignore next */
        yield put({
            type: failure(ActionTypes.TEST_START),
            payload: { error: err },
        });
    }
}

export function* stopTest({ payload }) {
    try {
        const {
            force
        } = payload;
        // call TestRunner service to stop the test
        yield call(services.mainIpc.call, 'TestRunnerService', 'stop', [force]);
        
        // reset active line cursor in all editors
        yield put(editorActions.resetActiveLines());
        
        yield put({
            type: success(ActionTypes.TEST_STOP),
            payload: null,
        });
    }
    catch (err) {
        console.error('Failed to stop the test', err);
        /* istanbul ignore next */
        yield put({
            type: failure(ActionTypes.TEST_STOP),
            payload: { error: err },
        });
    }
}

export function* continueTest({ payload }) {
    try {
        // call TestRunner service to stop the test
        yield call(services.mainIpc.call, 'TestRunnerService', 'continue');
        yield put({
            type: success(ActionTypes.TEST_CONTINUE),
            payload: null,
        });
    }
    catch (err) {
        /* istanbul ignore next */
        yield put({
            type: failure(ActionTypes.TEST_CONTINUE),
            payload: { error: err },
        });
    }
}

export function* handleOnLineUpdate ({ payload }) {
    const { file, line, time } = payload || {};
 
    const openFiles = yield select(state => state.editor.openFiles);

    let findedFile;

    // check if we have this file open in one of the editors
    if (openFiles[file]) {
        findedFile = file;
    } else {
        if (Object.keys(openFiles)) {
            for (var filePath of Object.keys(openFiles)) {
                if (
                    filePath &&
                    filePath.toLowerCase &&
                    file &&
                    file.toLowerCase &&
                    filePath.toLowerCase() === file.toLowerCase()
                ) {
                    findedFile = filePath;
                }
            }
        }
    }

    if (!findedFile) {
        yield put(wbActions.openFile(file));
        yield put(editorActions.openFile(file));
    }

    yield put(tabActions.setActiveTab(file));
    yield put(editorActions.setActiveFile(file));
    yield put(editorActions.setActiveLine(time, file, line));
}

export function* replClose({ payload }) {
    yield call(services.mainIpc.call, 'TestRunnerService', 'replClose');
    yield put(loggerActions.setActiveLogger('general'));
}

export function* replSend({ payload }) {
    const {
        cmd
    } = payload || {};
    yield call(services.mainIpc.call, 'TestRunnerService', 'replSend', [cmd]);
}

export function* startReplStart({ payload }) {
    yield call(services.mainIpc.call, 'TestRunnerService', 'replStart');
}
