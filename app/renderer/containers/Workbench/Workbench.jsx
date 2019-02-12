/*
 * Copyright (C) 2015-2018 CloudBeat Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
// @flow
import React, { Component, Fragment } from 'react';
import { Modal, Layout, Icon, Row, Col, Tooltip, message } from 'antd';
/* eslint-disable react/no-did-update-set-state */
import updateModals from '../../components/updateModals';
// Dialogs
import FileRenameDialog from '../../components/dialogs/FileRenameDialog';
import FileCreateDialog from '../../components/dialogs/FileCreateDialog';
import UpdateDialog from '../../components/dialogs/UpdateDialog';
import SettingsDialog from '../../components/dialogs/SettingsDialog';
// Other components
import TextEditor from '../TextEditor';
import Tabs from '../Tabs';
import FileExplorer from '../FileExplorer';
import Logger from '../Logger';
import Toolbar from '../../components/Toolbar';
import Navbar from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';
import Settings from '../Settings';
import * as Controls from '../../components/Toolbar/controls';
// Styles
import '../../css/common.scss';
import '../../css/workbench.scss';

const { Header } = Layout;

type Props = {
  settings: Object,
};

// set global message position
message.config({
  top: 65
});

export default class Workbench extends Component<Props> {
  props: Props;

  state = {
    showUpdatesDialog: false,
    showNoUpdatesDialog: false,
    toolbarControls: {
      'CTRL_TEST_CONTINUE': {
        visible: false,
      },
      'CTRL_TEST_STOP': {
        visible: false,
      }
    },
  }

  constructor(props) {
    super(props);

    this.handleTabChange = this.handleTabChange.bind(this);
    this.handleTabClose = this.handleTabClose.bind(this);
  }

  componentDidMount() {
    // start IDE initialization process
    this.props.initialize();    
  }

  handleTabChange(key) {
    this.props.onTabChange(key);
  }

  handleTabClose(key) {
    this.props.closeFile(key);
  }

  handleFileContentUpdate(path, content) {
    this.props.onContentUpdate(path, content);
  }

  handleBreakpointsUpdate(filePath, breakpoints) {
    this.props.updateBreakpoints(filePath, breakpoints);
  }

  handleSidebarResize(sidebar, newSize) {
    this.props.setSidebarSize(sidebar, newSize);
  }

  toggleSidebarVisible(sidebar) {
    this.props.setSidebarVisible(sidebar, !this.props.settings.sidebars[sidebar].visible);
  }

  handleToolbarButtonClick(ctrlId) {
    if (ctrlId === Controls.TEST_RUN) {      
      this.props.startTest();
    }
    else if (ctrlId === Controls.TEST_STOP) {
      this.props.stopTest();
    }
    else if (ctrlId === Controls.TEST_CONTINUE) {
      this.props.continueTest();
    }
    else if (ctrlId === Controls.TEST_MODE_MOB) {
      this.props.setTestMode('mob');
    }
    else if (ctrlId === Controls.TEST_MODE_WEB) {
      this.props.setTestMode('web');
    }
    else if (ctrlId === Controls.TEST_MODE_RESP) {
      this.props.setTestMode('resp');
    }
    else if (ctrlId === Controls.OPEN_FOLDER) {
      this.props.showDialog('OPEN_FOLDER');
    }
    else if (ctrlId === Controls.SAVE_FILE) {
      this.props.saveCurrentFile();
    }
    else if (ctrlId === Controls.NEW_FILE) {
      this.props.showNewFileDialog();      
    }
    else if (ctrlId === Controls.TEST_RECORD) {
      const { isRecording } = this.props;
      if (isRecording) {
        this.props.stopRecorder();  
      }
      else {
        this.props.startRecorder();
      }
    }
    else if (ctrlId === Controls.TEST_SETTINGS) {
      //this.toggleSidebarVisible('right');
      this.props.showDialog('DIALOG_SETTINGS');
    }
    console.log('handleToolbarButtonClick', ctrlId)
  }

  handleToolbarValueChange(ctrlId, value) {
    console.log('handleToolbarValueChange', ctrlId, value);
    if (ctrlId === Controls.TEST_TARGET) {
      this.props.setTestTarget(value);
    }
    else if (ctrlId === Controls.TEST_STEP_DELAY) {
      // convert string value to number
      if (value && !Number.isNaN(value)) {
        const intVal = parseInt(value);
        intVal >= 0 && this.props.setStepDelay(intVal);
      }      
    }
  }

  getToolbarControlsState() {
    const { test, isRecording, settings } = this.props;
    return {
      [Controls.TEST_RUN]: {
        visible: !test.isRunning,
        enabled: !isRecording,
      },
      [Controls.TEST_STOP]: {
        visible: test.isRunning,
      },
      [Controls.TEST_CONTINUE]: {
        visible: test.isPaused,
      },
      [Controls.TEST_RECORD]: {
        selected: isRecording,
      },
      [Controls.TEST_SETTINGS]: {
        selected: settings.sidebars.right.visible,
      },
    };
  }
  
  /* File Explorer Events */
  fileExplorer_onSelect(file) {
    if (file.type === 'file') {
      this.props.openFile(file.path);
    }
  }
  fileExplorer_onCreate(type, parentPath) {
    this.props.showDialog('DIALOG_FILE_CREATE', { type, path: parentPath });
  }
  fileExplorer_onRename(type, path, name) {
    this.props.showDialog('DIALOG_FILE_RENAME', { type, path, name });
  }
  fileExplorer_onDelete(type, path, name) {
    setTimeout(() => {
      if (!confirm(`Are you sure you want to delete ${name}?`)) {
        return false;
      }
      this.props.deleteFile(path);
    }, 500);
  }

  /* Logger */
  logger_onHide() {
    this.props.setLoggerVisible(false);
  }
  /* Dialogs Events */
  fileCreateDialog_onSubmit(name, type, parentPath) {
    this.props.hideDialog('DIALOG_FILE_CREATE');
    if (type === 'folder') {
      this.props.createFolder(parentPath, name);
    }
    else {
      this.props.createFile(parentPath, name);
    }
  }
  fileCreateDialog_onCancel() {
    this.props.hideDialog('DIALOG_FILE_CREATE');
  }
  // Rename
  fileRenameDialog_onSubmit(path, type, newName) {
    this.props.hideDialog('DIALOG_FILE_RENAME');
    this.props.renameFile(path, newName);
  }
  fileRenameDialog_onCancel() {
    this.props.hideDialog('DIALOG_FILE_RENAME');
  }
  // Update
  updateDialog_onSubmit() {
    this.props.hideDialog('DIALOG_UPDATE');
  }
  updateDialog_onCancel() {
    this.props.hideDialog('DIALOG_UPDATE');
  }
  // Settings
  settingsDialog_onSubmit(settings) {
    this.props.hideDialog('DIALOG_SETTINGS');
    this.props.updateRunSettings(settings);    
  }
  settingsDialog_onCancel() {
    this.props.hideDialog('DIALOG_SETTINGS');
  }

  render() {
    const { test, settings, dialog } = this.props;
    const { runtimeSettings } = test;
    // sidebars state
    const leftSidebarSize = settings.sidebars.left.size;
    const leftSidebarVisible = settings.sidebars.left.visible;
    const rightSidebarSize = settings.sidebars.right.size;
    const rightSidebarVisible = settings.sidebars.right.visible;
    const loggerVisible = settings.logger.visible;

    return (
      <div>
        { dialog && 
        <Fragment>
          { dialog.DIALOG_FILE_CREATE && dialog.DIALOG_FILE_CREATE.visible &&
            <FileCreateDialog 
              { ...dialog['DIALOG_FILE_CREATE'] }
              onSubmit={ ::this.fileCreateDialog_onSubmit }
              onCancel={ ::this.fileCreateDialog_onCancel } 
            />
          }
          <FileRenameDialog 
            { ...dialog['DIALOG_FILE_RENAME'] } 
            onSubmit={ ::this.fileRenameDialog_onSubmit }
            onCancel={ ::this.fileRenameDialog_onCancel } 
          />
          <SettingsDialog 
            { ...dialog['DIALOG_SETTINGS'] } 
            settings={ runtimeSettings }
            onSubmit={ ::this.settingsDialog_onSubmit }
            onCancel={ ::this.settingsDialog_onCancel } 
          />
          <UpdateDialog
            { ...dialog['DIALOG_UPDATE'] }
            onSubmit={ ::this.updateDialog_onSubmit }
            onCancel={ ::this.updateDialog_onCancel }
          />
        </Fragment>
        }
        {updateModals.call(this)}
        <Toolbar
          testMode={ runtimeSettings.testMode }
          testTarget={ runtimeSettings.testTarget }
          stepDelay={ runtimeSettings.stepDelay }
          devices={ test.devices }
          browsers={ test.browsers }
          emulators={ test.emulators }
          controlsState={ this.getToolbarControlsState() } 
          onButtonClick={ ::this.handleToolbarButtonClick }
          onValueChange={ ::this.handleToolbarValueChange } />
        <Row style={{ display: 'flex' }}>
          <Col style={{ display: 'none' }} className="sideNavClass">
            <Navbar />
          </Col>

          <Col style={{ width: '100%' }}>
            <Layout className="ide-main">
              <Sidebar 
                align="left"
                size={ leftSidebarSize } 
                visible={ leftSidebarVisible } 
                onResize={ (size) => ::this.handleSidebarResize('left', size) }
              >
                <FileExplorer 
                  onSelect={ ::this.fileExplorer_onSelect } 
                  onCreate={ ::this.fileExplorer_onCreate }
                  onRename={ ::this.fileExplorer_onRename }
                  onDelete={ ::this.fileExplorer_onDelete }
                />
              </Sidebar>
              <Layout className="ide-editors">{/*ideScreenEditorHolder*/}
                <Header className="tabs-container">{/*headerBar*/}
                  <Row>
                    <Col className="sidebar-trigger">                      
                      <Icon
                        title={!leftSidebarVisible ? 'Show tree' : 'Hide tree'}
                        className="trigger"
                        type={!leftSidebarVisible ? 'menu-unfold' : 'menu-fold'}
                        onClick={ () => ::this.toggleSidebarVisible('left') }
                        style={{ paddingLeft: 15, cursor: 'pointer' }}
                      />
                    </Col>
                    <Col className="tabs-bar-container">
                      <Tabs onChange={ this.handleTabChange } onClose={ this.handleTabClose } />
                    </Col>
                  </Row>
                </Header>
                <div className="editor-container">
                  <TextEditor
                    onBreakpointsUpdate={::this.handleBreakpointsUpdate}
                    onContentUpdate={::this.handleFileContentUpdate}
                  />
                  <Logger
                    visible={loggerVisible}
                    onHide={::this.logger_onHide}
                  />
                </div>
              </Layout>
              <Sidebar 
                align="right"
                size={ rightSidebarSize } 
                visible={ rightSidebarVisible } 
                onResize={ (size) => ::this.handleSidebarResize('right', size) }
              >
                <Settings />
              </Sidebar>
            </Layout>
          </Col>
        </Row>
      </div>
    );
  }
}

/* <Tooltip placement="top" > */
