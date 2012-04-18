/* <copyright>
 This file contains proprietary software owned by Motorola Mobility, Inc.<br/>
 No rights, expressed or implied, whatsoever to this software are provided by Motorola Mobility, Inc. hereunder.<br/>
 (c) Copyright 2011 Motorola Mobility, Inc.  All Rights Reserved.
 </copyright> */

/**
    @module montage/core/event/change-notification
*/

var Montage = require("montage").Montage,
    logger = require("core/logger").logger("change-notification"),
    UNDERSCORE = "_";

// key: <path>, <target uuid>, <listener uuid>
var _descriptorsDirectory = Object.create(null);

// key: <target uuid>, <path>
var _willChangeDescriptorsDirectory = Object.create(null);
var _willChangeDescriptorsIndexesDirectory = Object.create(null);
var _changeDescriptorsDirectory = Object.create(null);
var _changeDescriptorsIndexesDirectory = Object.create(null);

exports.__reset__ = function() {
    _descriptorsDirectory = Object.create(null);
    _willChangeDescriptorsDirectory = Object.create(null);
    _willChangeDescriptorsIndexesDirectory = Object.create(null);
    _changeDescriptorsDirectory = Object.create(null);
    _changeDescriptorsIndexesDirectory = Object.create(null);
    // also need to remove all installed setters
};

exports.__debug__ = function() {
    console.log("_descriptorsDirectory", _descriptorsDirectory);
    console.log("_willChangeDescriptorsDirectory", _willChangeDescriptorsDirectory, _willChangeDescriptorsIndexesDirectory);
    console.log("_changeDescriptorsDirectory", _changeDescriptorsDirectory, _changeDescriptorsIndexesDirectory);
};

var ChangeNotification = exports.ChangeNotification = Object.create(Montage, {
    // (object) => <object>.uuid
    //
    // (target_n): {
    //     <propertyPath_n>: {
    //         target,
    //         propertyPath,
    //         willChangeListeners: {
    //             (listener_n): {
    //                 listenerTarget,
    //                 listenerFunction,
    //                 listensToMutation
    //             }
    //         },
    //         changeListeners: same as willChangeListeners,
    //         willChangeListenersCount: Object.keys(willChangeListeners).length,
    //         changeListenersCount: Object.keys(changeListeners).length,
    //         handleWillChange: function()
    //         handleChange: function()
    //     }
    // }
    _descriptorsRegistry: {
        writable: true,
        value: Object.create(null)
    },

    _createFunctionDescriptor: {
        value: function(target, listener, beforeChange, mutation) {
            var identifier,
                functionName,
                functionDescriptor = Object.create(ChangeNotificationFunctionDescriptor);

            if (typeof listener === "function") {
                functionDescriptor.listenerFunction = listener;
                functionDescriptor.listenerTarget = target;
            } else {
                identifier = target.identifier;

                if (identifier) {
                    identifier = identifier.toCapitalized();

                    functionName = "handle" + identifier + (beforeChange ? "WillChange" : "Change");
                    if (typeof listener[functionName] === "function") {
                        functionDescriptor.listenerFunction = listener[functionName];
                        functionDescriptor.listenerTarget = listener;
                    }
                }

                if (!functionDescriptor.listenerFunction) {
                    functionName = "handle" + (beforeChange ? "WillChange" : "Change");
                    if (typeof listener[functionName] === "function") {
                        functionDescriptor.listenerFunction = listener[functionName];
                        functionDescriptor.listenerTarget = listener;
                    }
                }
            }

            functionDescriptor.listensToMutation = mutation;
            return functionDescriptor;
        }
    },

    registerPropertyChangeListener: {
        value: function(target, path, listener, beforeChange, mutation) {
            var targetKey = target.uuid,
                registry = this._descriptorsRegistry,
                targetEntry = registry[targetKey],
                descriptor;

            if (path == null) {
                path = "*";
            }

            if (!targetEntry) {
                targetEntry = registry[targetKey] = Object.create(null);
                targetEntry.propertyPathCount = 0;
            }

            descriptor = targetEntry[path];
            if (!descriptor) {
                descriptor = targetEntry[path] = Object.create(ChangeNotificationDescriptor).initWithTargetPath(target, path);
                targetEntry.propertyPathCount++;
            }
            descriptor.registerListener(listener, beforeChange, mutation);

            return descriptor;
        }
    },

    unregisterPropertyChangeListener: {
        value: function(target, path, listener, beforeChange) {
            var targetKey = target.uuid,
                registry = this._descriptorsRegistry,
                targetEntry = registry[targetKey],
                descriptor;

            if (path == null) {
                path = "*";
            }

            if (targetEntry) {
                descriptor = targetEntry[path];
                if (descriptor) {
                    // TODO: should this function return the number of listeners?
                    descriptor.unregisterListener(listener, beforeChange);
                    if (descriptor.willChangeListenersCount === 0 &&
                        descriptor.changeListenersCount === 0) {
                        delete targetEntry[path];
                        if (--targetEntry.propertyPathCount === 0) {
                            delete registry[targetKey];
                        }
                    }
                }
            }
        }
    },

    getPropertyChangeDescriptor: {
        value: function(target, path) {
            var targetEntry = this._descriptorsRegistry[target.uuid];

            if (targetEntry) {
                if (path == null) {
                    path = "*";
                }
                return targetEntry[path];
            }
        }
    },

    __debug__: {
        value: function() {
            console.log("_descriptorsRegistry: ", this._descriptorsRegistry);
        }
    },

    __reset__: {
        value: function() {
            this._descriptorsRegistry = Object.create(null);
        }
    }
});

var ChangeNotificationDescriptor = Object.create(Object.prototype, {
    target: {value: null},
    propertyPath: {value: null},
    willChangeListeners: {value: null},
    changeListeners: {value: null},
    willChangeListenersCount: {value: 0},
    changeListenersCount: {value: 0},
    isActive: {value: false},
    // list of all objects that this listener needed to start listening to.
    // these are the objects in the target.getProperty(path).
    // format [(dependencyDescriptor, remainingPath)*]
    dependencies: {value: null},
    hasWillChangeDependencies: {value: false},
    hasChangeDependencies: {value: false},
    // index of where this listener is expected to be in its dependent listeners
    dependentDescriptorsIndex: {value: null},
    mutationDependencyIndex: {value: null},
    mutationListenersCount: {value: 0},

    initWithTargetPath: {
        value: function(target, path) {
            this.target = target;
            this.propertyPath = path;

            return this;
        }
    },
    registerListener: {
        value: function(listener, beforeChange, mutation) {
            var listenerKey = listener.uuid;

            if (beforeChange) {
                listeners = this.willChangeListeners;
                if (!listeners) {
                    listeners = this.willChangeListeners = Object.create(null);
                }
                if (!(listenerKey in listeners)) {
                    listeners[listenerKey] = ChangeNotification._createFunctionDescriptor(this.target, listener, beforeChange, mutation);
                    this.willChangeListenersCount++;
                }
            } else {
                listeners = this.changeListeners;
                if (!listeners) {
                    listeners = this.changeListeners = Object.create(null);
                }
                if (!(listenerKey in listeners)) {
                    listeners[listenerKey] = ChangeNotification._createFunctionDescriptor(this.target, listener, beforeChange, mutation);
                    this.changeListenersCount++;
                }
            }

            if (mutation) {
                this.mutationListenersCount++;
            }
        }
    },
    unregisterListener: {
        value: function(listener, beforeChange) {
            var listenerKey = listener.uuid;

            if (beforeChange) {
                listeners = this.willChangeListeners;
                if (listeners && listenerKey in listeners) {
                    if (listeners[listenerKey].listensToMutation) {
                        this.mutationListenersCount--;
                    }
                    delete listeners[listenerKey];
                    this.willChangeListenersCount--;
                }
            } else {
                listeners = this.changeListeners;
                if (listeners && listenerKey in listeners) {
                    if (listeners[listenerKey].listensToMutation) {
                        this.mutationListenersCount--;
                    }
                    delete listeners[listenerKey];
                    this.changeListenersCount--;
                }
            }

            if (this.willChangeListenersCount === 0 &&
                this.changeListenersCount === 0) {
                // no need to listen to any dependencies now.
                this.removeDependencies();
            }
        }
    },
    hasListeners: {
        value: function() {
            return this.willChangeListenersCount > 0 ||
                   this.changeListenersCount > 0;
        }
    },
    setupDependencies: {
        value: function(target, path, beforeChange, mutation) {
            var self = this,
                dependencies = this.dependencies,
                ignoreMutation;

            if (this.hasChangeDependencies) {
                // if we're at this point it means that the only dependencies to install is
                // beforeChange dependencies, give up if they're already installed.
                if (this.hasWillChangeDependencies || !beforeChange) {
                    return;
                }
                // since the dependencies array is already setup, might as well use
                // it instead of going through getProperty again.
                for (var i = 0, l = dependencies.length; i < l; i+=3) {
                    dependencies[i].addPropertyChangeListener(dependencies[i+1], this, true, dependencies[i+2] != null);
                }
            } else {
                target.getProperty(path, null, null, function(target, propertyName, result, index, remainingPath) {
                    if (typeof propertyName !== "undefined") {
                        ignoreMutation = mutation ? remainingPath != null : true;
                        if (beforeChange) {
                            target.addPropertyChangeListener(propertyName, self, true, ignoreMutation);
                        }
                        // we always need to listen to the "afterChange" notification because
                        // we only have access to the plus object at that time.
                        // we need that object in order to install the new listeners
                        // on the remainingPath.
                        target.addPropertyChangeListener(propertyName, self, false, ignoreMutation);
                        self.registerDependency(target, propertyName, remainingPath);
                    }
                });
            }

            if (!this.hasChangeDependencies) {
                // At this point change dependencies were definentely installed
                // because we always need them to get the "plus" value.
                if (beforeChange) {
                    this.hasWillChangeDependencies = true;
                }
                this.hasChangeDependencies = true;
            } else {
                // If change dependencies were already installed then the only
                // option left is that will change dependencies were now installed.
                this.hasWillChangeDependencies = true;
            }
        }
    },
    removeDependencies: {
        value: function() {
            var dependencies = this.dependencies,
                target,
                propertyName,
                descriptor;

            if (dependencies) {
                for (var i = 0, l = dependencies.length; i < l; i+=3) {
                    target = dependencies[i];
                    propertyName = dependencies[i+1];
                    descriptor = ChangeNotification.getPropertyChangeDescriptor(target, propertyName);

                    if (this.hasWillChangeDependencies) {
                        target.removePropertyChangeListener(propertyName, this, true);
                    }
                    if (this.hasChangeDependencies) {
                        target.removePropertyChangeListener(propertyName, this);
                    }
                    delete descriptor.dependentDescriptorsIndex[this.uuid];
                }
                dependencies.length = 0;
            }
        }
    },
    updateDependenciesAtIndex: {
        value: function(index, oldValue, newValue) {
            var self = this,
                dependencies = this.dependencies,
                remainingPath = dependencies[index+2];

            // remove listeners from the old value
            if (oldValue != null) {
                oldValue.getProperty(remainingPath, null, null, function(target, propertyName, result, index, remainingPath) {
                    if (typeof propertyName !== "undefined") {
                        if (self.hasWillChangeDependencies) {
                            target.removePropertyChangeListener(propertyName, self, true);
                        }
                        if (self.hasChangeDependencies) {
                            target.removePropertyChangeListener(propertyName, self);
                        }
                        self.unregisterDependency(target, propertyName, remainingPath);
                    }
                });
            }

            // add listeners to the new value
            if (newValue != null) {
                newValue.getProperty(remainingPath, null, null, function(target, propertyName, result, index, remainingPath) {
                    if (typeof propertyName !== "undefined") {
                        if (self.hasWillChangeDependencies) {
                            target.addPropertyChangeListener(propertyName, self, true, remainingPath != null);
                        }
                        if (self.hasChangeDependencies) {
                            target.addPropertyChangeListener(propertyName, self, false, remainingPath != null);
                        }
                        self.registerDependency(target, propertyName, remainingPath);
                    }
                });
            }
        }
    },
    updateDependencies: {
        value: function(notification) {
            var dependenciesIndex = notification._dependenciesIndex;

            if (dependenciesIndex != null) {
                // This property change was triggered by a change in one of the
                // dependencies, therefore we need to remove all the listeners
                // from the old values and add listeners to the new ones.
                if (notification.isMutation) {
                    // If this listener is being triggered by a mutation change then
                    // we need to go through the old values and remove the listeners
                    // and go through the new values and add listeners.
                    for (var i = 0, l = notification.minus.length; i < l; i++) {
                        this.updateDependenciesAtIndex(dependenciesIndex, notification.minus[i], null);
                    }
                    for (var i = 0, l = notification.plus.length; i < l; i++) {
                        this.updateDependenciesAtIndex(dependenciesIndex, null, notification.plus[i]);
                    }
                } else {
                    this.updateDependenciesAtIndex(dependenciesIndex, notification.minus, notification.plus);
                }
            } else if (this.mutationListenersCount > 0 && !notification.isMutation) {
                // We're listening to mutation events on the property so we need
                // to remove the mutation listener on the old value and add it
                // to the new one.
                // However, we should restrict ourselves to notifications that
                // actually change the value at a property path, mutation doesn't
                // change the value at the property path, the value itself is
                // still the same.
                this.updateMutationDependency(notification.plus);
            }
        }
    },
    updateMutationDependency: {
        value: function(newTarget) {
            var target,
                installMutationDependency;

            if (this.mutationDependencyIndex != null) {
                var target = this.dependencies[this.mutationDependencyIndex];
            }
            
            if (target === newTarget) {
                return;
            }

            installMutationDependency = this.mutationListenersCount > 0 &&
                                        newTarget != null &&
                                        typeof newTarget === "object";

            if (target) {
                target.removePropertyChangeListener(null, this, true);
                target.removePropertyChangeListener(null, this, false);
                this.unregisterDependency(target, null, null);
                this.mutationDependencyIndex = null;
            }
            if (installMutationDependency) {
                if (this.willChangeListenersCount > 0) {
                    newTarget.addPropertyChangeListener(null, this, true);
                }
                if (this.changeListenersCount > 0) {
                    newTarget.addPropertyChangeListener(null, this, false);
                }
                this.mutationDependencyIndex = this.registerDependency(newTarget, null, null);
            }
        }
    },
    registerDependency: {
        value: function(target, propertyName, remainingPath) {
            var dependencyDescriptor = ChangeNotification.getPropertyChangeDescriptor(target, propertyName),
                dependentDescriptorsIndex,
                dependencies,
                dependentKey,
                ix;

            if (dependencyDescriptor) {
                dependentDescriptorsIndex = dependencyDescriptor.dependentDescriptorsIndex;
                dependencies = this.dependencies;
                dependentKey = this.uuid;

                if (!dependencies) {
                    dependencies = this.dependencies = [];
                }
                // TODO: should use descriptor after all?
                ix = dependencies.push(target, propertyName, remainingPath) - 3;
                if (!dependentDescriptorsIndex) {
                    dependentDescriptorsIndex = dependencyDescriptor.dependentDescriptorsIndex = Object.create(null);
                }
                if (!(dependentKey in dependentDescriptorsIndex)) {
                    dependentDescriptorsIndex[dependentKey] = ix;
                }

                return ix;
            }
        }
    },
    unregisterDependency: {
        value: function(target, propertyName, remainingPath) {
            var dependencyDescriptor = ChangeNotification.getPropertyChangeDescriptor(target, propertyName),
                dependencies = this.dependencies,
                targetIx;

            do {
                targetIx = dependencies.indexOf(target);
                if (dependencies[targetIx+1] === propertyName &&
                    dependencies[targetIx+2] === remainingPath) {
                    dependencies.splice(targetIx, 3);
                    break;
                } else {
                    targetIx = dependencies.indexOf(target, targetIx+1);
                }
            } while (targetIx != -1);
            if (targetIx == -1) {
                console.log("getProperty target not found in dependencies", target, propertyName, remainingPath);
                throw "getProperty target not found in dependencies";
            }

            // the descriptor might not exist anymore, if no more listeners are
            // setup in the (target, propertyName)
            if (dependencyDescriptor) {
                delete dependencyDescriptor.dependentDescriptorsIndex[this.uuid];
            }
        }
    },
    handleWillChange: {
        value: function(notification) {
            this.handleChange(notification, this.willChangeListeners);
        }
    },
    handleChange: {
        value: function(notification, listeners) {
            var listener,
                dependentDescriptorsIndex = this.dependentDescriptorsIndex,
                dependenciesIndex = notification._dependenciesIndex;

            // TODO: maybe I should replicate this
            if (arguments.length < 2) {
                listeners = this.changeListeners;
                this.updateDependencies(notification);
            }

            // TODO: I need to know the index of dependency, should this be in the notification?
            if (listeners) {
                notification._dependenciesIndex = null;
                for (var key in listeners) {
                    listener = listeners[key];
                    if (dependentDescriptorsIndex) {
                        notification._dependenciesIndex = dependentDescriptorsIndex[key];
                    }
                    notification.currentTarget = this.target;
                    listener.listenerFunction.call(listener.listenerTarget, notification);
                }
                notification._dependenciesIndex = dependenciesIndex;
            }
        }
    }
});

var ChangeNotificationFunctionDescriptor = Object.create(null, {
    listenerTarget: {writable: true, value: null},
    listenerFunction: {writable: true, value: null},
    listensToMutation: {writable: true, value: false}
});

var ObjectPropertyChangeDispatcherManager = Object.create(null, {
    installDispatcherOnTargetProperty: {
        value: function(target, propertyName) {
            var prototypeAndDescriptor,
                currentPropertyDescriptor,
                currentSetter,
                prototypeDefiningProperty;

            prototypeAndDescriptor = Object.getPrototypeAndDescriptorDefiningProperty(target, propertyName);
            currentPropertyDescriptor = prototypeAndDescriptor.propertyDescriptor;
            if (currentPropertyDescriptor) {
                currentSetter = currentPropertyDescriptor.set;
                prototypeDefiningProperty = prototypeAndDescriptor.prototype;
            }

            if (!currentSetter) {
                this.addDispatcherToTargetProperty(target, propertyName, currentPropertyDescriptor ? currentPropertyDescriptor.enumerable : true);
            } else if (!currentSetter.isDispatchingSetter) {
                this.addDispatcherToTargetPropertyWithDescriptor(target, propertyName, currentPropertyDescriptor);
            }
        }
    },

    uninstallDispatcherOnTargetProperty: {
        value: function(target, propertyName) {

        }
    },

    dispatcherPropertyNamePrefix: {
        value: "_"
    },

    addDispatcherToTargetProperty: {
        value: function(target, propertyName, enumerable) {
            var prefixedPropertyName = this.dispatcherPropertyNamePrefix + propertyName;

            DispatcherPropertyDescriptor.enumerable = enumerable;
            PrefixedPropertyDescriptor.value = target[propertyName];
            DispatcherPropertyDescriptor.get = function() {
                return this[prefixedPropertyName];
            };
            DispatcherPropertyDescriptor.set = function changeNotificationSetter(value) {
                var descriptor = ChangeNotification.getPropertyChangeDescriptor(target, propertyName),
                    previousValue,
                    notification;

                if (!descriptor) {
                    return;
                }

                previousValue = this[prefixedPropertyName];
                if (previousValue === value) {
                    // Nothing to do here
                    return;
                }

                if (descriptor.isActive &&
                    target === descriptor.target &&
                    propertyName === descriptor.propertyPath) {
                    //console.log("Cycle detected at ", target, " ", propertyName);
                    return;
                }

                // TODO: recycle these notification objects
                notification = Object.create(PropertyChangeNotification);
                notification.target = this;
                notification.propertyPath = propertyName;
                notification.minus = previousValue;

                descriptor.isActive = true;
                descriptor.handleWillChange(notification);
                this[prefixedPropertyName] = value;
                notification.plus = this[prefixedPropertyName];
                descriptor.handleChange(notification);
                descriptor.isActive = false;
            };
            DispatcherPropertyDescriptor.set.isDispatchingSetter = true;

            delete target[propertyName];
            Object.defineProperty(target, prefixedPropertyName, PrefixedPropertyDescriptor);
            Object.defineProperty(target, propertyName, DispatcherPropertyDescriptor);
        }
    },

    addDispatcherToTargetPropertyWithDescriptor: {
        value: function(target, propertyName, propertyDescriptor) {
            var originalSetter = propertyDescriptor.set;

            DispatcherPropertyDescriptor.enumerable = propertyDescriptor.enumerable;
            PrefixedPropertyDescriptor.value = target[propertyName];
            DispatcherPropertyDescriptor.get = propertyDescriptor.get;
            DispatcherPropertyDescriptor.set = function changeNotificationSetter(value) {
                var descriptor = ChangeNotification.getPropertyChangeDescriptor(target, propertyName),
                    previousValue,
                    notification;

                if (!descriptor) {
                    return;
                }

                previousValue = this[propertyName];
                if (previousValue === value) {
                    // Nothing to do here
                    return;
                }
                
                if (descriptor.isActive &&
                    target === descriptor.target &&
                    propertyName === descriptor.propertyPath &&
                    changeNotificationSetter.caller !== originalSetter) {
                    //console.log("Cycle detected at ", target, " ", propertyName);
                    return;
                }

                // TODO: recycle these notification objects
                notification = Object.create(PropertyChangeNotification);
                notification.target = this;
                notification.propertyPath = propertyName;
                notification.minus = previousValue;
                notification.plus = value;

                descriptor.isActive = true;
                descriptor.handleWillChange(notification);
                originalSetter.apply(this, arguments);
                notification.plus = this[propertyName];
                // this is a setter so we have no idea what it does to the value given
                // that's why we need to retrieve the value again
                descriptor.handleChange(notification);
                descriptor.isActive = false;
            };
            DispatcherPropertyDescriptor.set.isDispatchingSetter = true;
            DispatcherPropertyDescriptor.set.originalSetter = originalSetter;
            Object.defineProperty(target, propertyName, DispatcherPropertyDescriptor);
        }
    },

    removeDispatcherOnTargetProperty: {
        value: function(target, propertyName) {

        }
    }
});

Object.defineProperty(Object.prototype, "addPropertyChangeListener", {
    value: function(path, listener, beforeChange, ignoreMutation) {
        var descriptor,
            value;

        if (!listener || !path) {
            return;
        }

        descriptor = ChangeNotification.registerPropertyChangeListener(this, path, listener, beforeChange, !ignoreMutation);
        // if it's a multiple property path then setup the dependencies, otherwise
        // install a dispatcher on the property unless the target explicitly
        // asks not to with automaticallyDispatchPropertyChangeListener.
        if (path.indexOf(".") !== -1) {
            descriptor.setupDependencies(this, path, beforeChange, !ignoreMutation);
        } else if (typeof this.automaticallyDispatchPropertyChangeListener !== "function" ||
            this.automaticallyDispatchPropertyChangeListener(path)) {
            ObjectPropertyChangeDispatcherManager.installDispatcherOnTargetProperty(this, path);
            // give an oportunity for the actual value of the path to have something
            // to say when it comes to property change listeners, this is usuful,
            // for instance, for arrays, that can start listen on mutation.
            if (!ignoreMutation && descriptor.mutationListenersCount == 1) {
                descriptor.updateMutationDependency(this[path]);
            }
        }
    }
});
Object.defineProperty(Object.prototype, "removePropertyChangeListener", {
    value: function removePropertyChangeListener(path, listener, beforeChange) {
        var descriptor = ChangeNotification.getPropertyChangeDescriptor(this, path),
            value;

        if (!descriptor) {
            return;
        }

        ChangeNotification.unregisterPropertyChangeListener(this, path, listener, beforeChange);
        descriptor.updateMutationDependency();
    }
});

var DispatcherPropertyDescriptor = {
    configurable: true
};

var PrefixedPropertyDescriptor = {
    enumrable: false,
    writable: true,
    configurable: true
};

var PropertyChangeNotification = Object.create(null, {
    target: {writable: true, value: null},
    propertyPath: {writable: true, value: null},
    minus: {writable: true, value: null},
    plus: {writable: true, value: null},
    currentTarget: {writable: true, value: null},
    isMutation: {writable: true, value: false}
});

var ChangeNotificationDispatchingArray = exports.ChangeNotificationDispatchingArray = [];
var _index_array_regexp = /^[0-9]+$/;
Object.defineProperty(Array.prototype, "addPropertyChangeListener", {
    value: function(path, listener, beforeChange, ignoreMutation) {
        var listenChange, listenIndexChange,
            descriptor;

        if (!listener) {
            return;
        }

        if (path == null || path.indexOf(".") == -1) {
            listenChange = (path == null);
            listenIndexChange = _index_array_regexp.test(path);
        }

        if (listenChange || listenIndexChange) {
            if (!this.isDispatchingArray) {
                this.__proto__ = ChangeNotificationDispatchingArray;
            }
            descriptor = ChangeNotification.registerPropertyChangeListener(this, path, listener, beforeChange, !ignoreMutation);

            // give an oportunity for the actual value of the path to have something
            // to say when it comes to property change listeners, this is usuful,
            // for instance, for arrays, that can start listen on mutation.
            if (listenIndexChange && !ignoreMutation && descriptor.mutationListenersCount == 1) {
                descriptor.updateMutationDependency(this[path]);
            }
        } else {
            Object.prototype.addPropertyChangeListener.apply(this, arguments);
        }
    }
});

Object.defineProperty(ChangeNotificationDispatchingArray, "_dispatchArrayChangeNotification", {
    enumerable: false,
    configurable: false,
    value: function(methodName, methodArguments, index, howManyToRemove, newValues) {
        var descriptor = ChangeNotification.getPropertyChangeDescriptor(this, null),
            notification,
            indexNotification = Object.create(PropertyChangeNotification),
            delta,
            currentLength = this.length,
            howManyToAdd = newValues.length,
            maxLength,
            oldValues = this.slice(index, index+howManyToRemove);

        indexNotification.target = this;
        
        // can't remove more than the available elements.
        if (index + howManyToRemove > currentLength) {
            howManyToRemove = currentLength - index;
        }
        delta = howManyToAdd - howManyToRemove;
        maxLength = currentLength + (delta > 0 ? delta : 0);

        if (descriptor) {
            notification = Object.create(PropertyChangeNotification);
            notification.target = this;
            notification.minus = oldValues;
            notification.index = index;
            notification.isMutation = true;
            // dispatch mutation notification
            descriptor.handleWillChange(notification);
        }
        this._dispatchArrayBulkWillChangeNotification(indexNotification, index, newValues, delta, maxLength);

        result = this[methodName].apply(this, methodArguments);

        if (descriptor) {
            notification.plus = newValues;
            // dispatch mutation notification
            descriptor.handleChange(notification);
        }
        this._dispatchArrayBulkChangeNotification(indexNotification, index, oldValues, delta, maxLength);

        return result;
    }
});

Object.defineProperty(ChangeNotificationDispatchingArray, "_dispatchArrayBulkWillChangeNotification", {
    enumerable: false,
    configurable: false,
    value: function(notification, index, plus, delta, maxLength) {
        var descriptor,
            oldValue,
            newValue;

        for (var i = 0, l = plus.length; i < l; i++, index++) {
            descriptor = ChangeNotification.getPropertyChangeDescriptor(this, index);
            if (descriptor) {
                oldValue = this[index];
                newValue = plus[i];
                if (oldValue !== newValue) {
                    notification.index = index;
                    notification.propertyPath = String(index);
                    notification.minus = oldValue;
                    //notification.plus = newValue;
                    descriptor.handleWillChange(notification);
                }
            }
        }

        if (delta != 0) {
            for (; index < maxLength; index++) {
                descriptor = ChangeNotification.getPropertyChangeDescriptor(this, index);
                if (descriptor) {
                    oldValue = this[index];
                    newValue = this[index-delta];
                    if (oldValue !== newValue) {
                        notification.index = index;
                        notification.propertyPath = String(index);
                        notification.minus = oldValue;
                        //notification.plus = newValue;
                        descriptor.handleWillChange(notification);
                    }
                }
            }
        }
    }
});

Object.defineProperty(ChangeNotificationDispatchingArray, "_dispatchArrayBulkChangeNotification", {
    enumerable: false,
    configurable: false,
    value: function(notification, index, minus, delta, maxLength) {
        var descriptor,
            oldValue,
            newValue;

        for (var i = 0, l = minus.length; i < l; i++, index++) {
            descriptor = ChangeNotification.getPropertyChangeDescriptor(this, index);
            if (descriptor) {
                oldValue = minus[i];
                newValue = this[index];
                if (oldValue !== newValue) {
                    notification.index = index;
                    notification.propertyPath = String(index);
                    notification.minus = oldValue;
                    notification.plus = newValue;
                    descriptor.handleChange(notification);
                }
            }
        }

        if (delta != 0) {
            for (; index < maxLength; index++) {
                descriptor = ChangeNotification.getPropertyChangeDescriptor(this, index);
                if (descriptor) {
                    oldValue = this[index+delta];
                    newValue = this[index];
                    if (oldValue !== newValue) {
                        notification.index = index;
                        notification.propertyPath = String(index);
                        notification.minus = this[index+delta];
                        notification.plus = this[index];
                        descriptor.handleChange(notification);
                    }
                }
            }
        }
    }
});

Object.defineProperty(Array.prototype, "_setProperty", {
    enumerable: false,
    configurable: true,
    value: function(index, value) {
        return this[index] = value;
    }
});
Object.defineProperty(Array.prototype, "setProperty", {
    enumerable: false,
    configurable: true,
    value: function(path, value) {
        if (String(path).indexOf(".") == -1) {
            if (this.__proto__ === ChangeNotificationDispatchingArray && !isNaN(path)) {
                return this._dispatchArrayChangeNotification("_setProperty", arguments, Number(path), 1, Array.prototype.slice.call(arguments, 1, 2));
            } else {
                return this[path] = value;
            }
        } else {
            return Object.prototype.setProperty.apply(this, arguments);
        }
    }
});

Object.defineProperty(ChangeNotificationDispatchingArray, "isDispatchingArray", {
    enumerable: false,
    configurable: false,
    value: true
});

Object.defineProperty(ChangeNotificationDispatchingArray, "_splice", {
    enumerable: false,
    configurable: true,
    value: Array.prototype.splice
});
Object.defineProperty(ChangeNotificationDispatchingArray, "splice", {
    enumerable: false,
    configurable: true,
    value: function(index, howMany/*[, element1[, ...[, elementN]]]*/) {
        return this._dispatchArrayChangeNotification("_splice", arguments, index, howMany, Array.prototype.slice.call(arguments, 2));
    }
});

Object.defineProperty(ChangeNotificationDispatchingArray, "_shift", {
    enumerable: false,
    configurable: true,
    value: Array.prototype.shift
});
Object.defineProperty(ChangeNotificationDispatchingArray, "shift", {
    enumerable: false,
    configurable: true,
    value: function() {
        return this._dispatchArrayChangeNotification("_shift", arguments, 0, 1, []);
    }
});

Object.defineProperty(ChangeNotificationDispatchingArray, "_unshift", {
    enumerable: false,
    configurable: true,
    value: Array.prototype.unshift
});
Object.defineProperty(ChangeNotificationDispatchingArray, "unshift", {
    enumerable: false,
    configurable: true,
    value: function() {
        return this._dispatchArrayChangeNotification("_unshift", arguments, 0, 0, Array.prototype.slice.call(arguments, 0));
    }
});

Object.defineProperty(ChangeNotificationDispatchingArray, "_push", {
    enumerable: false,
    configurable: true,
    value: Array.prototype.push
});
Object.defineProperty(ChangeNotificationDispatchingArray, "push", {
    enumerable: false,
    configurable: true,
    value: function() {
        return this._dispatchArrayChangeNotification("_push", arguments, this.length, 0, Array.prototype.slice.call(arguments, 0));
    }
});

Object.defineProperty(ChangeNotificationDispatchingArray, "_pop", {
    enumerable: false,
    configurable: true,
    value: Array.prototype.pop
});
Object.defineProperty(ChangeNotificationDispatchingArray, "pop", {
    enumerable: false,
    configurable: true,
    value: function() {
        return this._dispatchArrayChangeNotification("_pop", arguments, this.length-1, 1, []);
    }
});